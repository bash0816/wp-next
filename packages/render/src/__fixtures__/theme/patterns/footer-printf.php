<?php
/**
 * Title: Fixture footer printf
 * Slug: fx/footer-printf
 */

?>
<p class="has-small-font-size">
	<?php
	printf(
		/* translators: Designed with WordPress. %s: WordPress link. */
		esc_html__( 'Designed with %s', 'fx' ),
		'<a href="' . esc_url( __( 'https://wordpress.org', 'fx' ) ) . '" rel="nofollow">WordPress</a>'
	);
	?>
</p>
