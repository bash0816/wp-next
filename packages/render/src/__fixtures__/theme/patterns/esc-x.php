<?php
/**
 * Title: Fixture escape x
 * Slug: fx/esc-x
 */

?>
<p><?php echo esc_html_x( '<script>alert(1)</script>', 'CTXMARK', 'fx' ); ?></p>
<div data-x="<?php echo esc_attr_x( '"onmouseover="alert(1)', 'CTXMARK', 'fx' ); ?>"></div>
