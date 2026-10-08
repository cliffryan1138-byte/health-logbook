// Starter training plans built only from US federal, public-domain sources
// (Cliff, 2026-10-08: group by level and goal, not by sex — the sources give
// men and women the same guidance; US government sources only).
//
// The exercise steps are the National Institute on Aging's words, unchanged
// (plan ground rule: quote the source, never paraphrase). Choosing which
// exercises go on which day is ours, following NIA's own frequency guidance,
// so each plan says "Adapted from" as NIA's reuse policy asks. NIA's photos
// are licensed stock and are not used; neither is the "Go4Life" name or the
// "Move Your Way" mark (both HHS trademarks), which are cited as sources only.
//
// Sources, all retrieved October 8, 2026:
//   NIA, Workout to Go, Pub. No. 11-4258, reprinted March 2015 (govinfo.gov)
//   NIA, Exercise & Physical Activity: Your Everyday Guide, Pub. No. 09-4258,
//     January 2009 (permanent.fdlp.gov)
//   NIA, "Three Types of Exercise Can Improve Your Health and Physical
//     Ability", content reviewed January 14, 2025 (nia.nih.gov)
//   HHS, Physical Activity Guidelines for Americans, 2nd edition, 2018
//     (odphp.health.gov; still the current edition, page updated Nov 19, 2025)
//   HHS/ODPHP Move Your Way fact sheets for pregnancy and postpartum
// The research notes with every quote and page number: docs/workout-sources.md.

export const RETRIEVED = 'October 8, 2026'
export const NIA_CREDIT = 'Adapted from the National Institute on Aging, National Institutes of Health.'

const W2G = { title: 'Workout to Go', pub: 'NIA Pub. No. 11-4258, reprinted March 2015', url: 'https://www.govinfo.gov/content/pkg/GOVPUB-HE20-PURL-gpo62941/pdf/GOVPUB-HE20-PURL-gpo62941.pdf' }
const GUIDE = { title: 'Exercise & Physical Activity: Your Everyday Guide', pub: 'NIA Pub. No. 09-4258, January 2009', url: 'https://permanent.fdlp.gov/lps121532/LPS121532.pdf' }

// Each exercise: NIA's name, its steps word for word, any tip or caution word
// for word, and where it came from.
const EX = {
  handGrip: { name: 'Hand Grip', reps: '10–15', src: [W2G, 5], steps: [
    'Hold a tennis ball in each hand.',
    'Slowly squeeze the ball as hard as you can and hold it for 3-5 seconds.',
    'Relax the squeeze slowly.',
    'Repeat 10-15 times.'] },
  wallPushUp: { name: 'Wall Push-Up', reps: '10–15', src: [W2G, 6], steps: [
    'Face a wall, standing a little farther than arm\'s length away, feet shoulder-width apart.',
    'Lean forward and put your palms flat against the wall at shoulder height and shoulder-width apart.',
    'Slowly bend your elbows and lower your upper body toward the wall. Keep your feet flat on the floor.',
    'Hold the position for 1 second.',
    'Slowly push yourself back until your arms are straight.',
    'Repeat 10-15 times.'] },
  overheadArmRaise: { name: 'Overhead Arm Raise', reps: '10–15', src: [W2G, 7],
    intro: 'You can do this exercise while standing or sitting with your feet flat on the floor, shoulder-width apart.',
    steps: [
      'Hold weights at your sides at shoulder height with palms facing forward.',
      'Slowly raise both arms up over your head keeping your elbows slightly bent.',
      'Hold the position for 1 second.',
      'Slowly lower your arms.',
      'Repeat 10-15 times.'],
    tip: 'As you progress, use a heavier weight and alternate arms until you can lift the weight comfortably with both arms.' },
  sideArmRaise: { name: 'Side Arm Raise', reps: '10–15', src: [GUIDE, 49], steps: [
    'You can do this exercise while standing or sitting in a sturdy, armless chair.',
    'Keep your feet flat on the floor, shoulder-width apart.',
    'Hold hand weights straight down at your sides with palms facing inward. Breathe in slowly.',
    'Slowly breathe out as you raise both arms to the side, shoulder height.',
    'Hold the position for 1 second.',
    'Breathe in as you slowly lower your arms.',
    'Repeat 10-15 times.',
    'Rest; then repeat 10-15 more times.'],
    tip: 'As you progress, use a heavier weight and alternate arms until you can lift the weight comfortably with both arms.' },
  armCurl: { name: 'Arm Curl', reps: '10–15', src: [GUIDE, 50], steps: [
    'Stand with your feet shoulder-width apart.',
    'Hold weights straight down at your sides, palms facing forward. Breathe in slowly.',
    'Breathe out as you slowly bend your elbows and lift weights toward chest. Keep elbows at your sides.',
    'Hold the position for 1 second.',
    'Breathe in as you slowly lower your arms.',
    'Repeat 10-15 times.',
    'Rest; then repeat 10-15 more times.'],
    tip: 'As you progress, use a heavier weight and alternate arms until you can lift the weight comfortably with both arms.' },
  backLegRaise: { name: 'Back Leg Raise', reps: '10–15 each leg', src: [W2G, 8], steps: [
    'Stand behind a sturdy chair, holding on for balance.',
    'Slowly lift one leg straight back without bending your knee or pointing your toes. Try not to lean forward. The leg you\'re standing on should be slightly bent.',
    'Hold the position for 1 second.',
    'Slowly lower your leg.',
    'Repeat 10-15 times.',
    'Repeat 10-15 times with the other leg.'],
    tip: 'As you progress, you may want to add ankle weights. You also can challenge yourself to improve your balance (see page 14).' },
  sideLegRaise: { name: 'Side Leg Raise', reps: '10–15 each leg', src: [W2G, 9], steps: [
    'Stand behind a sturdy chair, holding on for balance.',
    'Slowly lift one leg out to the side. Keep your back straight and your toes facing forward. The leg you\'re standing on should be slightly bent.',
    'Hold the position for 1 second.',
    'Slowly lower your leg.',
    'Repeat 10-15 times.',
    'Repeat 10-15 times with the other leg.'],
    tip: 'As you progress, you may want to add ankle weights. You also can challenge yourself to improve your balance (see page 14).' },
  kneeCurl: { name: 'Knee Curl', reps: '10–15 each leg', src: [GUIDE, 58], steps: [
    'Stand behind a sturdy chair, holding on for balance. Lift one leg straight back without bending your knee or pointing your toes. Breathe in slowly.',
    'Breathe out as you slowly bring your heel up toward your buttocks as far as possible. Bend only from your knee, and keep your hips still. The leg you are standing on should be slightly bent.',
    'Hold position for 1 second.',
    'Breathe in as you slowly lower your foot to the floor.',
    'Repeat 10-15 times.',
    'Repeat 10-15 times with other leg.',
    'Repeat 10-15 more times with each leg.'],
    tip: 'As you progress, you may want to add ankle weights.' },
  legStraightening: { name: 'Leg Straightening', reps: '10–15 each leg', src: [GUIDE, 59], steps: [
    'Sit in a sturdy chair with your back supported by the chair. Only the balls of your feet and your toes should rest on the floor. Put a rolled bath towel at the edge of the chair under thighs for support. Breathe in slowly.',
    'Breathe out and slowly extend one leg in front of you as straight as possible, but don\'t lock your knee.',
    'Flex foot to point toes toward the ceiling. Hold position for 1 second.',
    'Breathe in as you slowly lower leg back down.',
    'Repeat 10-15 times.',
    'Repeat 10-15 times with other leg.',
    'Repeat 10-15 more times with each leg.'],
    tip: 'As you progress, you may want to add ankle weights.' },
  chairStand: { name: 'Chair Stand', reps: '10–15', src: [GUIDE, 60],
    caution: 'If you have knee or back problems, talk with your doctor before trying this exercise.',
    steps: [
      'Sit toward the front of a sturdy, armless chair with knees bent and feet flat on floor, shoulder-width apart.',
      'Lean back with your hands crossed over your chest. Keep your back and shoulders straight throughout exercise. Breathe in slowly.',
      'Breathe out and bring your upper body forward until sitting upright.',
      'Extend your arms so they are parallel to the floor and slowly stand up.',
      'Breathe in as you slowly sit down.',
      'Repeat 10-15 times.',
      'Rest; then repeat 10-15 more times.'],
    tip: 'People with back problems should start the exercise from the sitting upright position.' },
  toeStand: { name: 'Toe Stand', reps: '10–15', src: [W2G, 10], steps: [
    'Stand behind a sturdy chair, feet shoulder-width apart, holding on for balance.',
    'Slowly stand on tiptoes as high as possible.',
    'Hold the position for 1 second.',
    'Slowly lower heels to the floor.',
    'Repeat 10-15 times.'],
    tip: 'As you progress, try doing the exercise standing on one leg at a time for a total of 10-15 times on each leg. You also can challenge yourself to improve your balance (see page 14).' },
  oneFoot: { name: 'Stand on One Foot', reps: '10 s × 10–15 each leg', src: [W2G, 11], steps: [
    'Stand on one foot behind a sturdy chair, holding on for balance.',
    'Hold the position for 10 seconds.',
    'Repeat 10-15 times.',
    'Repeat 10-15 times with the other leg.'] },
  heelToToe: { name: 'Heel-to-Toe Walk', reps: '20 steps', src: [W2G, 12],
    intro: 'If you are unsteady on your feet, try doing this exercise near a wall so you can steady yourself if you need to.',
    steps: [
      'Place the heel of one foot just in front of the toes of the other foot so that they touch or almost touch. Raise arms to your sides, shoulder height.',
      'Choose a spot ahead of you and focus on it to keep you steady as you walk.',
      'Take a step. Put your heel just in front of your other foot.',
      'Repeat for 20 steps.'],
    tip: 'As you progress, try looking from side to side as you walk, but skip this step if you have inner-ear problems.' },
  balanceWalk: { name: 'Balance Walk', reps: '20 steps', src: [W2G, 13], steps: [
    'Raise arms to your sides, shoulder height.',
    'Choose a spot ahead of you and focus on it to keep you steady as you walk.',
    'Walk in a straight line with one foot in front of the other.',
    'As you walk, lift your back leg. Pause for 1 second before stepping forward.',
    'Repeat for 20 steps.'] },
  ankleStretch: { name: 'Ankle Stretch', reps: '10–30 s holds × 3–5', src: [W2G, 15], steps: [
    'Sit securely toward the edge of a sturdy chair.',
    'Stretch your legs out in front of you.',
    'With your heels on the floor, bend your ankles to point toes toward you.',
    'Hold the position for 10-30 seconds.',
    'Bend ankles to point toes away from you and hold for 10-30 seconds.',
    'Repeat 3-5 times.'] },
  backStretch: { name: 'Back Stretch', reps: '10–30 s × 3–5 each side', src: [W2G, 16],
    caution: 'If you\'ve had hip or back surgery, talk with your doctor before trying this stretch.',
    steps: [
      'Sit toward the front of a sturdy chair with armrests, with your feet flat on the floor, shoulder-width apart. Stay as straight as possible.',
      'Slowly twist to the left from your waist without moving your hips. Turn your head to the left. Lift your left hand and hold on to the left arm of the chair. Place your right hand on the outside of your left thigh.',
      'Hold the position for 10-30 seconds. Slowly return to face forward.',
      'Repeat 3-5 times. Reverse positions and repeat 3-5 times on the right side.'] },
  thighStretch: { name: 'Thigh Stretch', reps: '10–30 s × 3–5 each leg', src: [W2G, 17],
    caution: 'If you\'ve had hip or back surgery, talk with your doctor before doing this stretch.',
    steps: [
      'Stand behind a sturdy chair with your feet shoulder-width apart and knees straight, but not locked.',
      'Hold on to the chair for balance with your right hand.',
      'Bend your left leg back and grab your foot in your left hand. Keep your knee pointed to the floor. If you can\'t grab your ankle, loop a resistance band, belt, or towel around your foot and hold both ends.',
      'Gently pull your leg until you feel a stretch in your thigh.',
      'Hold the position for 10-30 seconds.',
      'Repeat 3-5 times.',
      'Repeat 3-5 times with your right leg.'] },
  shoulderStretch: { name: 'Shoulder and Upper Arm Stretch', reps: '3–5 each side', src: [W2G, 18],
    caution: 'If you have shoulder problems, talk with your doctor before trying this stretch.',
    steps: [
      'Stand with your feet shoulder-width apart.',
      'Hold one end of a towel in your right hand.',
      'Raise and bend your right arm to drape the towel down your back.',
      'Reach behind your lower back and grasp the towel with your left hand.',
      'Pull the towel down with your left hand. Stop when you feel a stretch in your right shoulder.',
      'Repeat 3-5 times.',
      'Reverse positions and repeat 3-5 times to stretch your left shoulder.'] },
}

// The "How to" text shown under each exercise during a workout.
function cues(x) {
  return [
    x.caution && `Caution: ${x.caution}`,
    x.intro,
    x.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    x.tip && `Tip: ${x.tip}`,
    `Source: National Institute on Aging, NIH. ${x.src[0].title} (${x.src[0].pub}), p. ${x.src[1]}.`,
  ].filter(Boolean).join('\n\n')
}

const item = (key, sets = 1) => {
  const x = EX[key]
  return { name: x.name, sets: String(sets), reps: x.reps, rest_sec: '', cues: cues(x) }
}
const day = (title, weekday, focus, notes, exercises) => ({ title, weekday: String(weekday), focus, notes, exercises })

// NIA's words used as day and week notes.
const WARM_UP = 'It\'s important to spend about 5 minutes at the beginning of your routine to warm up. (NIA, Workout to Go, p. 4)'
const COOL_DOWN = 'To cool down, take about 5 minutes to do the following 4 flexibility exercises. (NIA, Workout to Go, p. 15)'
const BALANCE_SAFETY = 'Have a sturdy chair, person, or wall nearby to hold onto for support. (NIA, Three Types of Exercise, reviewed January 14, 2025)'
const SETS_NOTE = 'One set of eight to 12 repetitions of each exercise is effective, although two or three sets may be more effective. If you are a beginner, try exercises without weights or resistance bands (stretchy elastic bands that come in varying strengths) until you are comfortable with the movements. (NIA, Three Types of Exercise, reviewed January 14, 2025)'
const CHALLENGE = 'Start by holding on to a stu[r]dy chair with both hands for support. To challenge yourself further, try holding on with only one hand. As you feel steady, use just one finger for balance, or try the exercises without holding on. When you are steady on your feet, try doing the exercises with your eyes closed. (NIA, Workout to Go, p. 14)'
const STRETCHES = ['ankleStretch', 'backStretch', 'thighStretch', 'shoulderStretch']

export const PLAN_LIBRARY = [
  {
    id: 'nia-beginner',
    for: 'New to exercise, any age',
    summary: 'Two full-body strength days and three short balance sessions a week. No equipment to start: a sturdy chair, a towel, two tennis balls; soup cans or water bottles as weights later.',
    plan: {
      name: 'Beginner strength and balance',
      description: NIA_CREDIT,
      weeks: '4',
      week_notes: [
        { week: 1, text: SETS_NOTE },
        { week: 3, text: 'As the exercises become easier, gradually add more weight. (NIA, Workout to Go, p. 2)' },
      ],
      days: [
        day('Strength', 1, 'Whole body', `${WARM_UP}\n\n${COOL_DOWN}`, [
          item('wallPushUp'), item('overheadArmRaise'), item('chairStand'), item('backLegRaise'),
          item('sideLegRaise'), item('toeStand'), item('handGrip'), ...STRETCHES.map((k) => item(k)),
        ]),
        day('Balance', 2, 'Balance', BALANCE_SAFETY, [item('oneFoot'), item('heelToToe'), item('balanceWalk')]),
        day('Strength', 4, 'Whole body', `${WARM_UP}\n\n${COOL_DOWN}`, [
          item('wallPushUp'), item('overheadArmRaise'), item('chairStand'), item('backLegRaise'),
          item('sideLegRaise'), item('toeStand'), item('handGrip'), ...STRETCHES.map((k) => item(k)),
        ]),
        day('Balance', 5, 'Balance', BALANCE_SAFETY, [item('oneFoot'), item('heelToToe'), item('balanceWalk')]),
        day('Balance', 7, 'Balance', `${BALANCE_SAFETY}\n\n${CHALLENGE}`, [item('oneFoot'), item('heelToToe'), item('balanceWalk')]),
      ],
    },
  },
  {
    id: 'nia-older-adults',
    for: 'Older adults',
    summary: 'Upper body Monday, Wednesday and Friday; lower body with balance Tuesday, Thursday and Saturday, as in NIA’s sample week. Two sets each. Stretches every day.',
    guidance: 'As part of their weekly physical activity, older adults should do multicomponent physical activity that includes balance training as well as aerobic and muscle-strengthening activities. (HHS, Physical Activity Guidelines for Americans, 2nd edition, p. 68)',
    plan: {
      name: 'Strength, balance and flexibility for older adults',
      description: NIA_CREDIT,
      weeks: '',
      week_notes: [
        { week: 1, text: 'For example, do upper-body strength exercises on Monday, Wednesday, and Friday and lower-body strength exercises on Tuesday, Thursday, and Saturday. Or, you can do strength exercises of all of your muscle groups every other day. Don\'t forget to include balance and flexibility exercises. (NIA, Your Everyday Guide, p. 104)' },
      ],
      days: [1, 3, 5].map((wd) => day('Upper body', wd, 'Arms, shoulders, chest', `${WARM_UP}`, [
        item('wallPushUp', 2), item('overheadArmRaise', 2), item('sideArmRaise', 2), item('armCurl', 2), item('handGrip', 2),
        item('shoulderStretch'), item('backStretch'),
      ])).concat([2, 4, 6].map((wd) => day('Lower body and balance', wd, 'Legs, hips, balance', `${WARM_UP}\n\n${BALANCE_SAFETY}`, [
        item('chairStand', 2), item('backLegRaise', 2), item('sideLegRaise', 2), item('kneeCurl', 2), item('legStraightening', 2), item('toeStand', 2),
        item('oneFoot'), item('heelToToe'), item('balanceWalk'),
        item('ankleStretch'), item('thighStretch'),
      ]))).sort((a, b) => a.weekday - b.weekday),
    },
  },
  {
    id: 'nia-getting-back',
    for: 'Returning after a break',
    summary: 'Whole body every other day (Monday, Wednesday, Friday), starting at one set and building to three over six weeks.',
    plan: {
      name: 'Getting back into it',
      description: NIA_CREDIT,
      weeks: '6',
      week_notes: [
        { week: 1, text: `Weeks 1–2: one set of each. ${SETS_NOTE}` },
        { week: 3, text: 'Weeks 3–4: two sets of each (tap “+ Add a set”). Take 3 seconds to lift or push a weight into place, hold the position for 1 second, and take another 3 seconds to return to your starting position. (NIA, Your Everyday Guide, p. 42)' },
        { week: 5, text: 'Weeks 5–6: three sets of each. For each exercise, we show one set of 10-15 repetitions. Try doing 3 sets, and then cool down with the flexibility exercises. (NIA, Workout to Go, p. 2)' },
      ],
      days: [1, 3, 5].map((wd) => day('Whole body', wd, 'Strength, balance, stretch',
        `${WARM_UP}\n\nOr, you can do strength exercises of all of your muscle groups every other day. (NIA, Your Everyday Guide, p. 104)`, [
          item('wallPushUp'), item('armCurl'), item('overheadArmRaise'), item('chairStand'), item('kneeCurl'),
          item('legStraightening'), item('toeStand'), item('heelToToe'), ...STRETCHES.map((k) => item(k)),
        ])),
    },
  },
]

// Pregnancy and after birth: the US guidance as written. No federal source
// gives a pregnancy routine, so there is no plan, only this and the advice to
// ask the person's own provider.
export const PREGNANCY_GUIDANCE = {
  quotes: [
    'Women should do at least 150 minutes (2 hours and 30 minutes) of moderate-intensity aerobic activity a week during pregnancy and the postpartum period. Preferably, aerobic activity should be spread throughout the week.',
    'Women who habitually engaged in vigorous-intensity aerobic activity or who were physically active before pregnancy can continue these activities during pregnancy and the postpartum period.',
    'Women who are pregnant should be under the care of a health care provider who can monitor the progress of the pregnancy. Women who are pregnant can consult their health care provider about whether or how to adjust their physical activity during pregnancy and after the baby is born.',
  ],
  quoteSource: { title: 'Physical Activity Guidelines for Americans, 2nd edition', publisher: 'U.S. Department of Health and Human Services', page: 80, url: 'https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf' },
  avoid: 'Lots of activities are safe! Just avoid: Contact sports and anything where you could fall or get hit in the belly. Lying flat on your back during activity after the first trimester (it causes problems with blood flow).',
  afterBirth: 'Do you enjoy more intense activity, like running? You can get back to it — just start slow and build up to more activity over time. Physical activity may feel different after you have a baby. If an activity feels uncomfortable, try something else!',
  factSheetSource: { title: 'Move Your Way fact sheets: pregnancy and postpartum', publisher: 'HHS Office of Disease Prevention and Health Promotion', url: 'https://odphp.health.gov/moveyourway' },
}

// A library plan as a fresh editor draft (the editor and save path are the
// same as for a plan read from a photo).
export function draftFrom(entry, startsOn) {
  const p = structuredClone(entry.plan)
  return { ...p, started_on: startsOn, week_notes: p.week_notes || [] }
}
