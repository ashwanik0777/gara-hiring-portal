/**
 * Horizontal layout of the public pages: full width (no centred max-width box), with side
 * padding that grows with the screen. The navbar, the page content and the footer all use it,
 * so their left and right edges line up on every screen size.
 *
 * From md up the padding (56px+) also clears the floating social dock on the left edge
 * (about 42px wide), so the dock never covers text.
 */
export const PAGE_GUTTER = "w-full px-4 sm:px-6 md:px-14 lg:px-16 xl:px-20 2xl:px-32";
