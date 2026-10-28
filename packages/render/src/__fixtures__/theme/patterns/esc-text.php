<?php
/**
 * Title: Fixture escape text
 * Slug: fx/esc-text
 */

?>
<p><?php esc_html_e( '<script>alert(1)</script>', 'fx' ); ?></p>
<p><?php echo esc_html__( '" onmouseover="x & y', 'fx' ); ?></p>
