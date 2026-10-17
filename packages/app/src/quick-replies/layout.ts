import { DEFAULT_CONTENT_MAX_WIDTH } from "@/styles/theme";

/**
 * Narrowest right-hand gutter that still fits one quick reply chip beside the composer.
 * Under this width the composer cannot show the bar without squeezing the centered input
 * column, so the pane's track row carries a single "常用回复" entry instead.
 */
export const QUICK_REPLIES_GUTTER_MIN_WIDTH = 96;

/**
 * Composer horizontal chrome the gutter competes with: the input area's horizontal padding
 * (spacing[4] on both sides) plus the two row gaps that separate the column from its gutters.
 */
const COMPOSER_HORIZONTAL_CHROME = 2 * 16 + 2 * 12;

/**
 * Container width at which the composer shows the quick replies gutter. The centered input
 * column keeps its max width and both side gutters split the surplus, so the column stays
 * exactly centered only once the surplus covers a usable gutter on each side.
 */
export const QUICK_REPLIES_GUTTER_BREAKPOINT =
  DEFAULT_CONTENT_MAX_WIDTH + 2 * QUICK_REPLIES_GUTTER_MIN_WIDTH + COMPOSER_HORIZONTAL_CHROME;
