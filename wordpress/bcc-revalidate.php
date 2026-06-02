<?php
/**
 * BCC live-sync ping.
 *
 * Whenever staff content changes in WordPress, this tells the public mirror to
 * refresh that content immediately (instead of waiting out its 5-minute cache).
 *
 * It posts to the mirror's PRODUCTION domain on purpose: that domain is the only
 * one Vercel leaves open, and the mirror's revalidate endpoint purges its cache
 * globally — so the staff (login-gated) preview updates instantly too.
 *
 * Install: drop this file in wp-content/mu-plugins/ (create that folder if it
 * doesn't exist). Files there load automatically — no activation needed.
 */

if (!defined('ABSPATH')) exit;

// The mirror's webhook + shared secret (must match BCC_REVALIDATE_SECRET on Vercel).
define('BCC_REVALIDATE_URL', 'https://better-connected-casual.vercel.app/api/revalidate/');
define('BCC_REVALIDATE_SECRET', 'PASTE_YOUR_SECRET_HERE'); // must match BCC_REVALIDATE_SECRET on Vercel

function bcc_ping_mirror() {
    // Fire-and-forget: don't slow down the WordPress save.
    wp_remote_post(BCC_REVALIDATE_URL . '?secret=' . rawurlencode(BCC_REVALIDATE_SECRET), array(
        'timeout'  => 0.01,
        'blocking' => false,
    ));
}

// Posts, pages, custom post types (news, events, documents, etc.).
add_action('save_post',    'bcc_ping_mirror');
add_action('deleted_post', 'bcc_ping_mirror');

// Staff people directory (WP Users).
add_action('profile_update', 'bcc_ping_mirror');
add_action('user_register',  'bcc_ping_mirror');
add_action('deleted_user',   'bcc_ping_mirror');
