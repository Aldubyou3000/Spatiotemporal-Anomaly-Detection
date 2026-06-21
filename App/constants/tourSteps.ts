/**
 * Spotlight tour step definitions — kept separate from the component so the copy
 * and the highlighted targets are easy to edit without touching tour logic.
 *
 * `target` is a stable key the Dashboard registers a measured rect under (see
 * <SpotlightTour> + index.tsx). A step whose target has no rect at run time
 * (e.g. the first ticket card when the list is empty) is skipped automatically,
 * so the tour degrades gracefully.
 */

export type TourTargetKey = 'search' | 'filters' | 'card' | 'nav' | 'help';

export interface TourStep {
  /** Which registered element this step points at. */
  target: TourTargetKey;
  title: string;
  body: string;
  /** Corner rounding of the spotlight hole — match the target's own radius. */
  radius?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'search',
    title: 'Find a ticket',
    body: 'This is your search box. Type a ticket name, number, or place and it finds it right away — it looks through every ticket you have, no matter what stage it is in.',
    radius: 12,
  },
  {
    target: 'filters',
    title: 'Sort your list',
    body: 'Use these to choose what shows in your list. The top row switches between your current work and older or finished jobs, and the buttons below let you show just one kind at a time — like the ones given to you or the ones you are still working on.',
    radius: 18,
  },
  {
    target: 'card',
    title: 'Open a ticket',
    body: 'Each box in the list is one ticket. Tap it to open the full details, where you can read everything about the job and then start the work or send in your report.',
    radius: 16,
  },
  {
    target: 'nav',
    title: 'Move around',
    body: 'These buttons at the bottom take you around the app — your tickets here on the home page, a list of your latest updates, and your own profile and settings.',
    radius: 999,
  },
  {
    target: 'help',
    title: 'See this again',
    body: 'That is the end of the tour. You can tap this button any time to go through this guide again, in case you ever forget where something is.',
    radius: 999,
  },
];
