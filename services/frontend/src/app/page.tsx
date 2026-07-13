import Link from "next/link";
import { Camera, Mic, MonitorPlay, SlidersHorizontal, RadioTower } from "lucide-react";

export default function Home() {
  return (
    <main className="home shell">
      <header className="topbar"><div className="brand"><i /> POC-D1</div><span>NO LOCAL SFU · ANT MEDIA DIRECT</span></header>
      <section className="hero">
        <p><RadioTower size={15} /> DIRECT D1 PROOF OF CONCEPT</p>
        <h1>หลายกล้อง หลายเสียง<br /><em>ส่งตรงเข้า D1 จริง</em></h1>
        <span>ไม่มี LiveKit หรือ RTP Bridge; Redis เก็บเฉพาะ Source Registry และ Media ทุกเส้นเชื่อม Ant Media โดยตรง</span>
      </section>
      <section className="home-grid">
        <Link href="/camera"><Camera size={28} /><strong>ต่อกล้อง</strong><span>Publish กล้องและไมค์ตรงเข้า D1</span></Link>
        <Link href="/microphone"><Mic size={28} /><strong>ต่อไมโครโฟน</strong><span>Publish audio-only ตรงเข้า D1</span></Link>
        <Link href="/studio"><SlidersHorizontal size={28} /><strong>เปิด Studio</strong><span>เลือกกล้อง ผสมเสียง และส่ง Program</span></Link>
        <Link href="/viewer"><MonitorPlay size={28} /><strong>เปิด Viewer</strong><span>รับชม Program จาก Ant Media D1</span></Link>
      </section>
    </main>
  );
}
