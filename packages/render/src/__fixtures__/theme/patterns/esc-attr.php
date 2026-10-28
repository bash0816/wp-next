<?php
/**
 * Title: Fixture escape attr
 * Slug: fx/esc-attr
 */

?>
<div data-x="<?php esc_attr_e( '" onmouseover="alert(1)', 'fx' ); ?>" data-y="<?php echo esc_attr__( 'it\'s <b> & "q"', 'fx' ); ?>"></div>
