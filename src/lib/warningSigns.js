// The CDC's Urgent Maternal Warning Signs, word for word (plan ground rule 2:
// quote the source, never paraphrase). US government content. It ships with
// the app so the list shows with no network. Re-check the page when it
// changes and update `updated` and `retrieved`.

export const SIGNS_SOURCE = {
  title: 'Urgent Maternal Warning Signs and Symptoms',
  publisher: 'CDC, HEAR HER Campaign',
  url: 'https://www.cdc.gov/hearher/maternal-warning-signs/index.html',
  updated: 'May 15, 2024',
  retrieved: 'October 8, 2026',
  developedBy: 'This list was developed by the Alliance for Innovation on Maternal Health.',
}

export const SIGNS_INTRO = [
  'Be aware of urgent maternal warning signs and symptoms during pregnancy and in the year after delivery.',
  'Seek medical care immediately if you experience any signs or symptoms that are listed below.',
  'The symptoms below can be a sign of a life-threatening condition.',
]

export const SIGNS = [
  { title: 'Headache that won’t go away or gets worse over time', points: [
    'Feels like the worst headache of your life.',
    'Lasts even after treatment with medication and fluid intake.',
    'Starts suddenly with severe pain—like a clap of thunder.',
    'Throbs and is on one side of your head above your ear.',
    'Comes with blurred vision or dizziness.'] },
  { title: 'Dizziness or fainting', points: [
    'You faint or pass out.',
    'You have dizziness and lightheadedness that\'s ongoing, or comes and goes over many days.',
    'You experience a gap in time of which you have no memory.'] },
  { title: 'Changes in your vision', points: [
    'You see flashes of light or bright spots.',
    'You have blind spots or you can\'t see at all for a short time.',
    'Your vision is blurry, you can\'t focus, or you\'re seeing double.'] },
  { title: 'Fever of 100.4°F or higher', points: [
    'You have a temperature of 100.4°F (38°C) or higher.'] },
  { title: 'Extreme swelling of your hands or face', points: [
    'Swelling in your hands makes it hard to bend your fingers or wear rings.',
    'Swelling in your face makes it hard to open your eyes all the way—they feel and look puffy.',
    'Your lips and mouth feel swollen or you have a loss of feeling.',
    'This swelling is not like the usual slight swelling that most moms have during pregnancy, especially during the last few months of pregnancy.'] },
  { title: 'Thoughts about harming yourself or your baby', crisis: true, points: [
    'You may think about hurting yourself because you:',
    '— Feel very sad, hopeless, or not good enough.',
    '— Don\'t feel that you have control over your life.',
    '— Feel extremely worried all the time.',
    'You may think about hurting your baby and/or you may have scary thoughts that come when you don’t want or that are hard to get rid of.'] },
  { title: 'Trouble Breathing', points: [
    'You feel short of breath suddenly or over time, as if you can\'t breathe deeply enough to get enough air in your lungs.',
    'Your throat and/or chest feel tight.',
    'You have trouble breathing when you\'re laying down flat, such as needing to prop your head up with pillows to sleep.'] },
  { title: 'Chest pain or fast-beating heart', points: [
    'You have chest pain, such as: a feeling of tightness or pressure in the center of your chest; pain that travels to your back, neck, or arm.',
    'You have a change in your heartbeat, such as: a fast heartbeat or a pounding in your chest; an irregular heart rate or skipped heartbeats.',
    'You feel dizzy, faint, or disoriented.',
    'You have trouble catching your breath (talking and breathing are difficult).',
    'These symptoms can happen at any time and anywhere or may be triggered by a specific event.'] },
  { title: 'Severe nausea and throwing up', points: [
    'You feel severely sick to your stomach (nauseous) beyond the normal queasy feeling and throwing up that many moms have in early pregnancy.',
    'You are unable to drink for more than 8 hours or eat for more than 24 hours.',
    'You throw up and can\'t keep water or other fluids in your stomach.',
    'You have: a dry mouth; headaches; confusion; fever; dizziness or lightheadedness.'] },
  { title: 'Severe belly pain that doesn’t go away', points: [
    'You have a sharp, stabbing, or cramp-like belly pain that doesn\'t go away.',
    'Your belly pain starts suddenly and is severe, or gets worse over time.',
    'You have severe chest, shoulder, or back pain.'] },
  { title: 'Baby’s movement stopping or slowing during pregnancy', points: [
    'You feel that your baby has stopped moving or your baby is moving less than before.',
    'There is no specific number of movements that is considered normal. A change in your baby\'s movement is what is important.'] },
  { title: 'Vaginal bleeding or fluid leaking during pregnancy', points: [
    'You have any bleeding from your vagina that is more than spotting—like a period.',
    'You have fluid leaking out of your vagina.',
    'You have vaginal discharge that smells bad.'] },
  { title: 'Vaginal bleeding or discharge after pregnancy', points: [
    'You have heavy bleeding—soaking through one or more pads in an hour.',
    'You pass clots bigger than an egg or you pass tissue.',
    'You have vaginal discharge that smells bad.'] },
  { title: 'Severe swelling, redness, or pain of your leg or arm', points: [
    'Anytime during pregnancy or up to 6 weeks after birth',
    'You have swelling, pain, or tenderness in your leg—usually your calf or in one leg.',
    'It may or may not hurt when you touch it.',
    'It may hurt when you flex your foot to stand or walk.',
    'The painful area can also be red, swollen, and warm to the touch.',
    'You have pain, tenderness or swelling in your arm, usually on just one side of your body.'] },
  { title: 'Overwhelming tiredness', points: [
    'You are suddenly very tired and weak, not like chronic fatigue.',
    'You don\'t have enough energy to go about your day.',
    'No matter how much you sleep, you don\'t feel refreshed.',
    'You feel so tired that you don\'t get up to take care of your baby.',
    'You feel sad after having your baby.'] },
]

export const SIGNS_OUTRO = 'This list is not meant to cover every symptom you might have. If you feel like something just isn\'t right, or you aren\'t sure if it\'s serious, talk to your health care provider. Be sure to tell them if you are pregnant or were pregnant within the last year.'

// The CDC's own words on baby's movements, shown with the kick counter.
export const MOVEMENT_NOTE = SIGNS.find((s) => s.title.startsWith('Baby’s movement')).points
