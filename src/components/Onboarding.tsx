interface OnboardingProps {
  onDismiss: () => void;
}

const STEPS = [
  {
    emoji: "🤏",
    title: "จีบนิ้วเพื่อวาด",
    detail:
      "แตะปลายนิ้วโป้งกับนิ้วชี้เข้าด้วยกันแล้วลากมือ ปล่อยนิ้วเพื่อหยุดเส้น",
  },
  {
    emoji: "👆",
    title: "ชี้แล้วจีบเพื่อคลิกปุ่ม",
    detail:
      "เลื่อนปลายนิ้วไปเหนือปุ่มใดก็ได้ วงแหวนจะแสดงระยะจีบ จีบเพื่อกดปุ่มนั้น",
  },
  {
    emoji: "🎨",
    title: "เมนูวงกลมด้านล่าง",
    detail:
      "เปิดเพื่อเลือกแปรง สี และขนาดเส้น — จีบค้างที่ปุ่มกลางแล้วลากเพื่อย้ายตำแหน่ง",
  },
];

/**
 * First-visit gesture tutorial. Rendered BELOW the live cursor layer so the
 * fingertip ring stays visible while pinch-clicking the start button.
 */
export function Onboarding({ onDismiss }: OnboardingProps) {
  return (
    <div className="overlay-center onboarding">
      <div className="overlay-card glass onboard-card">
        <div className="onboard-badge">🖐️</div>
        <h2>วาดภาพกลางอากาศด้วยมือของคุณ</h2>
        <ul className="onboard-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className="step-emoji">{step.emoji}</span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <button className="retry-btn" onClick={onDismiss}>
          เริ่มวาดเลย
        </button>
      </div>
    </div>
  );
}
