<?php
/**
 * BCC Render — sandbox helper (Better Connected Casual mirror)
 * Returns fully-rendered, casual-role Oxygen HTML to an authenticated ADMIN caller.
 * Security: REST route requires admin (Application Password). The internal render uses a
 * ONE-TIME 30s nonce (no standing backdoor), SSL stays ON, and only in-scope post types
 * can be rendered. Delete this file anytime to remove it completely.
 *
 * Install: wp-content/novamira-sandbox/bcc-render.php
 */
if (!defined('ABSPATH')) { return; }

function bcc_allowed_types() {
    return array('post','learning-development','q-a','bc_project','main-directory',
        'annual-winner','quarterly-winner','ceo-spotlight-winner','special-recognition','page');
}

// One-time unlock: a valid, unused, unexpired nonce makes THIS request render as a casual user.
add_action('init', function () {
    if (is_admin() || empty($_GET['bcc_render'])) { return; }
    $key = 'bcc_render_' . sanitize_text_field((string) $_GET['bcc_render']);
    if (!get_transient($key)) { return; }
    delete_transient($key); // consume immediately
    $casual = get_users(array('role' => 'casual', 'number' => 1, 'fields' => 'ID'));
    if (!empty($casual)) { wp_set_current_user((int) $casual[0]); }
    if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE', true); }
}, 0);

add_action('rest_api_init', function () {
    register_rest_route('bcc/v1', '/render', array(
        'methods' => 'GET',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'args' => array('id' => array('type'=>'integer'), 'path' => array('type'=>'string')),
        'callback' => function (WP_REST_Request $req) {
            $id = (int) $req->get_param('id');
            $path = trim((string) $req->get_param('path'));
            if ($id > 0) {
                $type = get_post_type($id);
                if (!$type || !in_array($type, bcc_allowed_types(), true))
                    return new WP_Error('forbidden_type', 'Out of scope', array('status'=>403));
                if (get_post_status($id) !== 'publish')
                    return new WP_Error('not_published', 'Not published', array('status'=>404));
                $url = get_permalink($id);
            } elseif ($path !== '') {
                $url = home_url('/' . ltrim($path, '/'));
            } else {
                return new WP_Error('bad_request', 'Provide id or path', array('status'=>400));
            }
            $nonce = wp_generate_password(32, false, false);
            set_transient('bcc_render_' . $nonce, 1, 30);
            $resp = wp_remote_get(add_query_arg('bcc_render', $nonce, $url), array(
                'timeout'=>25, 'redirection'=>0, 'sslverify'=>true,
                'user-agent'=>'BCC-Render/1.0 (+internal)',
            ));
            delete_transient('bcc_render_' . $nonce);
            if (is_wp_error($resp))
                return new WP_Error('render_failed', $resp->get_error_message(), array('status'=>502));
            return array(
                'id'=>$id, 'url'=>$url,
                'status'=>(int) wp_remote_retrieve_response_code($resp),
                'location'=>wp_remote_retrieve_header($resp, 'location'),
                'html'=>wp_remote_retrieve_body($resp),
            );
        },
    ));
});
