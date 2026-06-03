<?php
/**
 * BCC Data — sandbox helper (READ-ONLY). Exposes directory (WP users) + document
 * library data for the mirror's native grids. Admin-gated. Delete anytime to remove.
 *
 * Install: wp-content/novamira-sandbox/bcc-data.php
 *   GET /wp-json/bcc/v1/directory  -> staff people directory (from WP users)
 *   GET /wp-json/bcc/v1/documents  -> document library (main-directory CPT)
 */
if (!defined('ABSPATH')) { return; }

add_action('rest_api_init', function () {
  $admin = function () { return current_user_can('manage_options'); };

  register_rest_route('bcc/v1', '/directory', array(
    'methods' => 'GET', 'permission_callback' => $admin,
    'callback' => function () {
      $out = array();
      foreach (get_users(array('number' => -1, 'orderby' => 'display_name')) as $u) {
        $roles  = wp_get_object_terms($u->ID, 'staff-role', array('fields' => 'names'));
        $locs   = wp_get_object_terms($u->ID, 'staff-location', array('fields' => 'names'));
        $letter = wp_get_object_terms($u->ID, 'staff-letter', array('fields' => 'names'));
        if (is_wp_error($roles)) $roles = array();
        if (empty($roles) && (is_wp_error($letter) || empty($letter))) continue; // skip non-directory accounts
        $am = get_user_meta($u->ID, 'current_user_avatar', true); $avatar = '';
        if (is_numeric($am)) $avatar = wp_get_attachment_image_url((int)$am, 'medium');
        if (!$avatar && filter_var($am, FILTER_VALIDATE_URL)) $avatar = $am;
        if (!$avatar) $avatar = get_avatar_url($u->ID, array('size' => 200));
        $out[] = array(
          'id' => $u->ID, 'name' => $u->display_name,
          'job_title' => (string) get_user_meta($u->ID, 'user_job_title', true),
          'location' => (!is_wp_error($locs) && $locs) ? $locs[0] : '',
          'letter' => (!is_wp_error($letter) && $letter) ? strtoupper($letter[0]) : strtoupper(substr($u->display_name,0,1)),
          'roles' => array_values($roles), 'avatar' => $avatar,
        );
      }
      return $out;
    },
  ));

  register_rest_route('bcc/v1', '/documents', array(
    'methods' => 'GET', 'permission_callback' => $admin,
    'callback' => function () {
      $out = array();
      foreach (get_posts(array('post_type'=>'main-directory','post_status'=>'publish','numberposts'=>-1,'orderby'=>'title','order'=>'ASC')) as $p) {
        $cats = wp_get_post_terms($p->ID, 'main-directory-category', array('fields'=>'names')); if (is_wp_error($cats)) $cats = array();
        $links = array(); $rows = function_exists('get_field') ? get_field('main_directory_post_links', $p->ID) : array();
        if (is_array($rows)) foreach ($rows as $r) {
          $t = isset($r['link_title']) ? $r['link_title'] : ''; $url = '';
          if (!empty($r['external_link'])) $url = $r['external_link'];
          else foreach (array('internal_link_or_media_file_new','internal_link_or_media_file') as $k) {
            if (!empty($r[$k])) { $v=$r[$k]; $url = is_array($v)?(isset($v['url'])?$v['url']:''):(is_numeric($v)?wp_get_attachment_url($v):$v); break; }
          }
          if ($t || $url) $links[] = array('title'=>$t?:'Open','url'=>$url);
        }
        $out[] = array('id'=>$p->ID,'title'=>get_the_title($p),'category'=>$cats,'links'=>$links);
      }
      return $out;
    },
  ));
});
