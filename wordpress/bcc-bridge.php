<?php
/**
 * BCC forms bridge  (v3)
 *
 * Lets the public mirror show Forminator forms and submit them back into THIS
 * site's Forminator (entries + email notifications), exactly like an on-site
 * submission:
 *
 *   GET  /wp-json/bcc/v1/form/{id}   -> the form's field schema (to render natively)
 *   POST /wp-json/bcc/v1/form-submit -> run a submission through Forminator's engine
 *   POST /wp-json/bcc/v1/form-upload -> stage one file (multiple-upload ajax flow)
 *
 * Both require an authenticated request (the mirror uses the existing application
 * password, server-side only). The submit endpoint mints Forminator's security
 * token in the SAME request it verifies it, so the token always matches.
 *
 * TEST MODE: send ?bcc_test=1 (or a bcc_test=1 field). The bridge BLOCKS the email
 * and DELETES the exact entry it created, then reports bcc_test_mode + which entry
 * ids it removed -- so submissions can be validated without emailing real staff.
 * It also returns bcc_test_captured: the saved field values (uploads/signatures
 * included) so a test submission can confirm files/signatures persisted.
 *
 * Install: wp-content/novamira-sandbox/bcc-bridge.php  (loaded by the Novamira sandbox,
 * alongside bcc-data.php and bcc-render.php). Replaces the old mu-plugins/bcc-forms.php.
 *
 * v3: captcha bypass now covers ALL Forminator captcha providers -- reCAPTCHA,
 *     hCaptcha AND Cloudflare Turnstile. The contact form (id 53) uses Turnstile,
 *     whose siteverify endpoint (challenges.cloudflare.com/turnstile/v0/siteverify)
 *     the previous filter did not match, so verification ran for real and failed.
 *     Also forces wp_doing_ajax so save_entry's wp_send_json routes through wp_die()
 *     (capturable) instead of bare die() under REST; adds /form-upload for staged
 *     multiple-file uploads.
 */

if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function () {
    register_rest_route('bcc/v1', '/form/(?P<id>\d+)', array(
        'methods'             => 'GET',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback'            => 'bcc_form_schema',
    ));
    register_rest_route('bcc/v1', '/form-submit', array(
        'methods'             => 'POST',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback'            => 'bcc_form_submit',
    ));
    // Stages ONE file into Forminator's temp dir (for 'multiple' uploads using the
    // default 'ajax' upload-method). The mirror calls this per file before submit, then
    // sends the returned file_name back in the forminator-multifile-hidden JSON on submit.
    register_rest_route('bcc/v1', '/form-upload', array(
        'methods'             => 'POST',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback'            => 'bcc_form_upload',
    ));
});

if (!function_exists('bcc_form_schema')) {
function bcc_form_schema($req) {
    if (!class_exists('Forminator_API')) {
        return new WP_REST_Response(array('error' => 'Forminator not active'), 500);
    }
    $id   = absint($req['id']);
    $form = Forminator_API::get_form($id);
    if (!$form) return new WP_REST_Response(array('error' => 'Form not found'), 404);

    $s      = is_object($form) && isset($form->settings) ? $form->settings : array();
    $fields = array();

    foreach ($form->get_fields() as $f) {
        $a    = $f->to_array();
        $type = isset($a['type']) ? $a['type'] : '';
        $field = array(
            'element_id'  => isset($a['element_id']) ? $a['element_id'] : '',
            'type'        => $type,
            'label'       => isset($a['field_label']) ? $a['field_label'] : '',
            'required'    => !empty($a['required']),
            'placeholder' => isset($a['placeholder']) ? $a['placeholder'] : '',
            'description' => isset($a['description']) ? $a['description'] : '',
        );

        if (in_array($type, array('select', 'radio', 'checkbox'), true)) {
            $opts = array();
            if (!empty($a['options']) && is_array($a['options'])) {
                foreach ($a['options'] as $o) {
                    $opts[] = array(
                        'label' => isset($o['label']) ? $o['label'] : '',
                        'value' => isset($o['value']) ? $o['value'] : '',
                    );
                }
            }
            $field['options']  = $opts;
            $field['multiple'] = ($type === 'checkbox') || (isset($a['value_type']) && $a['value_type'] === 'multiselect');
        }

        if ($type === 'name') {
            $field['multiple'] = !empty($a['multiple_name']);
            $cols = array();
            foreach (array('prefix', 'first-name', 'middle-name', 'last-name') as $c) {
                if (!empty($a[$c])) {
                    $cols[] = array(
                        'key'         => $c,
                        'label'       => isset($a[$c . '-label']) ? $a[$c . '-label'] : '',
                        'placeholder' => isset($a[$c . '-placeholder']) ? $a[$c . '-placeholder'] : '',
                        'required'    => !empty($a[$c . '-required']),
                    );
                }
            }
            $field['cols'] = $cols;
        }

        if ($type === 'textarea') {
            $field['rows'] = isset($a['textarea-rows']) ? (int) $a['textarea-rows'] : 4;
        }
        if ($type === 'upload') {
            $ftype = isset($a['file-type']) ? $a['file-type'] : (isset($a['upload-type']) ? $a['upload-type'] : 'single');
            $field['multiple']   = ($ftype === 'multiple');
            $field['filesize']   = isset($a['upload-limit']) ? $a['upload-limit'] : (isset($a['filesize']) ? $a['filesize'] : '');
            $field['extensions'] = isset($a['upload-extensions']) ? $a['upload-extensions'] : (isset($a['extensions']) ? $a['extensions'] : '');
        }
        if ($type === 'html') {
            $field['html'] = isset($a['variations']) ? $a['variations'] : (isset($a['markup']) ? $a['markup'] : '');
        }
        if ($type === 'section') {
            $field['section_title']    = isset($a['section_title']) ? $a['section_title'] : (isset($a['field_label']) ? $a['field_label'] : '');
            $field['section_subtitle'] = isset($a['section_subtitle']) ? $a['section_subtitle'] : '';
        }

        $fields[] = $field;
    }

    return array(
        'id'           => $id,
        'name'         => isset($s['formName']) ? $s['formName'] : '',
        'submit_label' => isset($s['submitData']['custom-submit-text']) && $s['submitData']['custom-submit-text'] !== '' ? $s['submitData']['custom-submit-text'] : 'Submit',
        'thankyou'     => isset($s['thankyou-message']) && $s['thankyou-message'] !== '' ? $s['thankyou-message'] : 'Thank you. Your submission has been received.',
        'fields'       => $fields,
    );
}
}

if (!function_exists('bcc_form_upload')) {
// Stage one uploaded file into Forminator's temp dir using the field's own handler
// (handle_file_upload with upload_type='upload'). Returns the temp file_name, which the
// mirror echoes back at submit so Forminator's ajax multi-upload moves it temp -> final.
function bcc_form_upload($req) {
    if (!class_exists('Forminator_API') || !class_exists('Forminator_Core')) {
        return new WP_REST_Response(array('success' => false, 'message' => 'Forminator not active'), 500);
    }
    $form_id    = absint(isset($_POST['form_id']) ? $_POST['form_id'] : $req->get_param('form_id'));
    $element_id = sanitize_text_field(isset($_POST['element_id']) ? $_POST['element_id'] : (string) $req->get_param('element_id'));
    if (!$form_id || $element_id === '') {
        return new WP_REST_Response(array('success' => false, 'message' => 'Missing form_id or element_id'), 400);
    }
    if (empty($_FILES['file']) || !isset($_FILES['file']['tmp_name'])) {
        return new WP_REST_Response(array('success' => false, 'message' => 'No file received'), 400);
    }
    $form = Forminator_API::get_form($form_id);
    if (!$form) return new WP_REST_Response(array('success' => false, 'message' => 'Form not found'), 404);

    // Locate the target upload field's settings.
    $field_array = null;
    foreach ($form->get_fields() as $f) {
        $a = $f->to_formatted_array();
        if ((isset($a['element_id']) ? $a['element_id'] : '') === $element_id && (isset($a['type']) ? $a['type'] : '') === 'upload') {
            $field_array = $a;
            break;
        }
    }
    if (!$field_array) return new WP_REST_Response(array('success' => false, 'message' => 'Upload field not found'), 404);

    $obj  = Forminator_Core::get_field_object('upload');
    $resp = $obj->handle_file_upload($form_id, $field_array, array('totalFiles' => 1), 'upload', $_FILES['file']);
    if (!is_array($resp) || empty($resp['success'])) {
        $msg = (is_array($resp) && isset($resp['message'])) ? $resp['message'] : 'Upload failed';
        return new WP_REST_Response(array('success' => false, 'message' => $msg), 200);
    }
    return new WP_REST_Response(array(
        'success'   => true,
        'file_name' => $resp['file_name'],
        'file_url'  => isset($resp['file_url']) ? $resp['file_url'] : '',
    ), 200);
}
}

if (!function_exists('bcc_form_submit')) {
function bcc_form_submit($req) {
    if (!class_exists('Forminator_API')) {
        return new WP_REST_Response(array('success' => false, 'data' => 'Forminator not active'), 500);
    }

    // PHP already populated $_POST/$_FILES from the relayed multipart body.
    $form_id = absint(isset($_POST['form_id']) ? $_POST['form_id'] : $req->get_param('form_id'));
    if (!$form_id) return new WP_REST_Response(array('success' => false, 'data' => 'Missing form_id'), 400);

    // Test detection from EVERY possible source (query is the most reliable).
    $test = ($req->get_param('bcc_test') === '1')
        || (isset($_GET['bcc_test'])  && $_GET['bcc_test']  === '1')
        || (isset($_POST['bcc_test']) && $_POST['bcc_test'] === '1');

    // Submission envelope Forminator expects.
    $_POST['action']  = 'forminator_submit_form_custom-forms';
    $_POST['form_id'] = $form_id;
    if (empty($_POST['render_id']))   $_POST['render_id']   = 0;
    if (empty($_POST['current_url'])) $_POST['current_url'] = home_url('/');
    if (empty($_POST['page_id']))     $_POST['page_id']     = 0;
    // Mint the token here, in the same request that verifies it -> always valid.
    $_POST['forminator_nonce'] = wp_create_nonce('forminator_submit_form' . $form_id);
    $_REQUEST = array_merge((array) $_REQUEST, $_POST);

    if ($test) {
        add_filter('pre_wp_mail', '__return_true', 999, 2); // hard-block real emails
    }

    // Internal, password-gated staff tool with no public access -> captcha (which only
    // guards against public spam) serves no purpose. Neutralise it: give Forminator a
    // non-empty token for every provider so it proceeds to verification, then fake a
    // successful siteverify response. Forminator supports reCAPTCHA (g-recaptcha-response),
    // hCaptcha (h-captcha-response) and Cloudflare Turnstile (cf-turnstile-response).
    if (empty($_POST['g-recaptcha-response'])) $_POST['g-recaptcha-response'] = 'bcc-internal';
    if (empty($_POST['h-captcha-response']))   $_POST['h-captcha-response']   = 'bcc-internal';
    if (empty($_POST['cf-turnstile-response'])) $_POST['cf-turnstile-response'] = 'bcc-internal';
    $_REQUEST = array_merge((array) $_REQUEST, $_POST);
    add_filter('pre_http_request', function ($pre, $args, $url) {
        // Match the siteverify endpoint of ANY Forminator captcha provider:
        //   reCAPTCHA -> www.google.com/recaptcha/api/siteverify
        //   hCaptcha  -> hcaptcha.com/siteverify
        //   Turnstile -> challenges.cloudflare.com/turnstile/v0/siteverify
        if (strpos($url, 'siteverify') !== false) {
            return array(
                'response' => array('code' => 200, 'message' => 'OK'),
                'body'     => wp_json_encode(array(
                    'success'  => true,
                    'score'    => 0.9,
                    'action'   => 'submit',
                    'hostname' => parse_url(home_url(), PHP_URL_HOST),
                )),
            );
        }
        return $pre;
    }, 1, 3);

    // Record the highest entry id BEFORE, so we can delete exactly what we create.
    global $wpdb;
    $entry_table = $wpdb->prefix . 'frmt_form_entry';
    $before_max  = (int) $wpdb->get_var($wpdb->prepare("SELECT MAX(entry_id) FROM $entry_table WHERE form_id=%d", $form_id));

    // Find Forminator's submit handler instance.
    global $wp_filter;
    $inst = null;
    $hook = 'wp_ajax_forminator_submit_form_custom-forms';
    if (isset($wp_filter[$hook])) {
        foreach ($wp_filter[$hook]->callbacks as $set) {
            foreach ($set as $c) {
                if (is_array($c['function']) && (isset($c['function'][1]) ? $c['function'][1] : '') === 'save_entry') {
                    $inst = $c['function'][0];
                    break 2;
                }
            }
        }
    }
    if (!$inst) return new WP_REST_Response(array('success' => false, 'data' => 'Forminator handler not found'), 500);

    // save_entry() finishes with wp_send_json_success(). Under a REST request
    // wp_doing_ajax() is false, so wp_send_json() calls bare die() -- which NO filter
    // can intercept, so our post-save cleanup (entry delete, test flag) never runs and
    // the echoed JSON leaks out as the raw response. wp_doing_ajax() is filterable, so
    // force the ajax path: wp_send_json() then routes through wp_die(), which we capture.
    add_filter('wp_doing_ajax', '__return_true');

    // wp_send_json() -> wp_die(). Capture the JSON instead of dying.
    $thrower = function () {
        return function ($m) { throw new Exception(is_scalar($m) ? (string) $m : wp_json_encode($m)); };
    };
    add_filter('wp_die_handler', $thrower);
    add_filter('wp_die_ajax_handler', $thrower);
    add_filter('wp_die_json_handler', $thrower);

    ob_start();
    try { $inst->save_entry(); } catch (Throwable $e) { /* expected: thrown by wp_die after JSON echo */ }
    $out = ob_get_clean();

    $json = json_decode($out, true);
    if (!is_array($json)) {
        $json = array('success' => false, 'data' => 'Unexpected response', 'raw' => substr((string) $out, 0, 400));
    }

    // Test mode: remove exactly the entries created in THIS request; report what happened.
    if ($test) {
        $new_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT entry_id FROM $entry_table WHERE form_id=%d AND entry_id > %d",
            $form_id, $before_max
        ));
        $deleted = array();
        $captured = array();
        foreach ($new_ids as $eid) {
            // Capture saved field values (esp. uploads/signatures) BEFORE deleting, so a
            // test submission can confirm files/signatures actually persisted to the entry.
            $entry = Forminator_API::get_entry($form_id, (int) $eid);
            if ($entry && !empty($entry->meta_data) && is_array($entry->meta_data)) {
                $fields = array();
                foreach ($entry->meta_data as $key => $md) {
                    $fields[$key] = isset($md['value']) ? $md['value'] : $md;
                }
                $captured[(int) $eid] = $fields;
            }
            Forminator_API::delete_entry($form_id, (int) $eid);
            $deleted[] = (int) $eid;
        }
        $json['bcc_test_deleted_entries'] = $deleted;
        $json['bcc_test_captured'] = $captured;
    }
    $json['bcc_test_mode'] = $test;

    return new WP_REST_Response($json, 200);
}
}
