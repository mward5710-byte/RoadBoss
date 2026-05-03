// useDriverShift \u2014 the brain of Driver Home. Maps the trucker's actual workflow into a state machine.
//
// Shift states (in order of a driver's real day):
//   start_of_shift   \u2014 Off duty, no inspection logged today \u2192 must do PRE-TRIP first
//   waiting_dispatch \u2014 Pre-trip done, no planned trip yet   \u2192 watch for assignment
//   ready_to_roll    \u2014 Planned trip exists, awaiting start  \u2192 start the trip
//   driving          \u2014 Active trip running                  \u2192 HOS countdown is king
//   needs_post_trip  \u2014 Trip ended but no post-trip today    \u2192 must close out FMCSA
//   off_duty         \u2014 Day complete or sleeping             \u2192 rest screen
//
// Each state returns: { state, primary, secondary[], hidden[] }
// where primary = the ONE card the driver sees front and center.

const TODAY = () => new Date().toISOString().slice(0, 10);

function isToday(iso) {
  if (!iso) return false;
  try { return iso.slice(0, 10) === TODAY(); } catch { return false; }
}

export function computeDriverShift({ me, trips = [], inspections = [], reminders = [] }) {
  if (!me) return { state: 'loading' };

  const myTrips = (trips || []).filter((t) => t.driver_id === me.id);
  const activeTrip = myTrips.find((t) => t.status === 'active');
  const plannedTrip = myTrips.find((t) => t.status === 'planned');
  const completedToday = myTrips.find((t) => t.status === 'completed' && isToday(t.ended_at || t.updated_at));

  const certifiedToday = (inspections || []).filter((i) => i.status === 'certified' && isToday(i.certified_at));
  const preTripToday = certifiedToday.find((i) => i.inspection_type === 'pre_trip');
  const postTripToday = certifiedToday.find((i) => i.inspection_type === 'post_trip');

  const overdueMaint = (reminders || []).filter((r) => r.severity === 'critical' || r.overdue).length;

  // ---- DRIVING (active trip) wins everything else ----
  if (activeTrip) {
    return {
      state: 'driving',
      label: 'On the road',
      primary: { kind: 'active_trip', trip: activeTrip },
      secondary: ['voice', 'roadside', 'hos'],
      hidden: ['pre_trip', 'post_trip', 'planned_trip'],
    };
  }

  // ---- POST-TRIP (just finished trip, owe a post-trip inspection) ----
  if (completedToday && !postTripToday && me.status !== 'sleeper') {
    return {
      state: 'needs_post_trip',
      label: 'Wrap it up',
      primary: { kind: 'post_trip', trip: completedToday },
      secondary: ['voice', 'hos', 'duty_off'],
      hidden: ['pre_trip', 'planned_trip', 'roadside'],
    };
  }

  // ---- START OF SHIFT (no pre-trip done today, off duty) ----
  if (!preTripToday) {
    return {
      state: 'start_of_shift',
      label: 'Start your day',
      primary: { kind: 'pre_trip' },
      secondary: ['voice', 'duty_on', 'maint'],
      hidden: ['post_trip', 'roadside'],
      maintWarning: overdueMaint > 0 ? overdueMaint : null,
    };
  }

  // ---- READY TO ROLL (pre-trip done + planned trip exists) ----
  if (plannedTrip) {
    return {
      state: 'ready_to_roll',
      label: 'Load assigned',
      primary: { kind: 'planned_trip', trip: plannedTrip },
      secondary: ['voice', 'hos', 'pre_trip_redo'],
      hidden: ['post_trip', 'roadside'],
    };
  }

  // ---- WAITING FOR DISPATCH (pre-trip done, no planned trip) ----
  if (preTripToday && !plannedTrip && !completedToday) {
    return {
      state: 'waiting_dispatch',
      label: 'Watching for dispatch',
      primary: { kind: 'await_dispatch' },
      secondary: ['voice', 'hos', 'roadside'],
      hidden: ['post_trip'],
    };
  }

  // ---- OFF DUTY / DONE FOR THE DAY ----
  return {
    state: 'off_duty',
    label: 'Off duty',
    primary: { kind: 'rest' },
    secondary: ['voice', 'hos'],
    hidden: ['pre_trip', 'post_trip', 'planned_trip', 'roadside'],
  };
}
