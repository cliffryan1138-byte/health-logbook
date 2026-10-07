const P = {
  logo: <path d="M3 12h4l2 6 4-14 2 8h6" />,
  scale: <path d="M12 3v18M7 7h10M5 21h14M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" />,
  drop: <path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  flame: <path d="M12 2c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1.5 1.5 2 2 1 0-2-1-4-1-6z" />,
  dumbbell: <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  pulse: <path d="M3 12h4l2 6 4-14 2 8h6" />,
  camera: (
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  mic: (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
    </>
  ),
  pen: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  pill: (
    <>
      <path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7z" />
      <path d="M8.5 8.5l7 7" />
    </>
  ),
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  speaker: (
    <>
      <path d="M11 5L6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </>
  ),
}

export default function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] || null}
    </svg>
  )
}
