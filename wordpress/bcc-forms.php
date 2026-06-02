<?php
/**
 * BCC forms bridge.
 *
 * Two read/relay endpoints so the public mirror can show Forminator forms and
 * submit them back into THIS site's Forminator (entries + email notifications),
 * exactly like an on-site submission:
 *
 *   GET  /wp-json/bcc/v1/form/{id}   -> the form's field schema (to render natively)
 *   POST /wp-json/bcc/v1/form-submit -> run a submission through Forminator's engine
 *
 * Both require an authenticated request (the mirror uses the existing application
 * password, server-side only). The submit endpoint mints Forminator's security
 * token in the SAME request it verifies it, so the token always matches — this is
 * why admin-ajax (which ignores application passwords) could not be used directly.
 *
 * Install: wp-content/mu-plugins/bcc-forms.php
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
});

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

function bcc_form_submit($req) {
    if (!class_exists('Forminator_API')) {
        return new WP_REST_Response(array('success' => false, 'data' => 'Forminator not active'), 500);
    }

    // PHP already populated $_POST/$_FILES from the relayed multipart body.
    $form_id = absint(isset($_POST['form_id']) ? $_POST['form_id'] : $req->get_param('form_id'));
    if (!$form_id) return new WP_REST_Response(array('success' => false, 'data' => 'Missing form_id'), 400);

    $test = (isset($_POST['bcc_test']) ? $_POST['bcc_test'] : $req->get_param('bcc_test')) === '1';

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
        add_filter('pre_wp_mail', '__return_true', 10, 2); // block real emails during a test
    }

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

    // save_entry() ends with wp_send_json + wp_die. Capture the JSON instead of dying.
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

    // Test mode: remove the entry we just created so nothing is left behind.
    if ($test && !empty($json['success'])) {
        global $wpdb;
        $t = $wpdb->prefix . 'frmt_form_entry';
        $nid = (int) $wpdb->get_var($wpdb->prepare("SELECT MAX(entry_id) FROM $t WHERE form_id=%d", $form_id));
        if ($nid) {
            Forminator_API::delete_entry($form_id, $nid);
            $json['bcc_test_deleted_entry'] = $nid;
        }
    }

    return new WP_REST_Response($json, 200);
}
