// PHQ-9 (depression) and GAD-7 (anxiety), word for word. Both were developed
// by Drs. Spitzer, Williams, Kroenke and colleagues with an educational grant
// from Pfizer; no permission is required to reproduce, translate, display or
// distribute them. Scores are screening scores, not diagnoses, shown with the
// published severity bands. (WG-PLAN-HEALTH-002 workstream 5, Decision D6.)

export const OPTIONS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day']

export const DIFFICULTY = [
  ['not', 'Not difficult at all'], ['somewhat', 'Somewhat difficult'],
  ['very', 'Very difficult'], ['extremely', 'Extremely difficult'],
]

export const FORMS = {
  phq9: {
    name: 'PHQ-9',
    about: 'Mood (depression) check-up',
    stem: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    items: [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
      'Trouble concentrating on things, such as reading the newspaper or watching television',
      'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
      'Thoughts that you would be better off dead or of hurting yourself in some way',
    ],
    // Question 9 (index 8): any answer above "Not at all" opens the 988 card.
    crisisItem: 8,
    bands: [[0, 'Minimal'], [5, 'Mild'], [10, 'Moderate'], [15, 'Moderately severe'], [20, 'Severe']],
    max: 27,
  },
  gad7: {
    name: 'GAD-7',
    about: 'Anxiety check-up',
    stem: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
    items: [
      'Feeling nervous, anxious, or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid as if something awful might happen',
    ],
    crisisItem: null,
    bands: [[0, 'Minimal'], [5, 'Mild'], [10, 'Moderate'], [15, 'Severe']],
    max: 21,
  },
}

export const band = (kind, score) => FORMS[kind].bands.filter(([min]) => score >= min).at(-1)[1]
