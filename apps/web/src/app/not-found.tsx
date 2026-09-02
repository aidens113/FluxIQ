import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return <main className="directory-page"><section className="route-recovery-surface"><span className="program-icon"><SearchX aria-hidden size={20} /></span><div><p className="page-kicker">Not found</p><h1 className="page-title">That page is not available</h1><p className="page-copy">The domain, program, or page may have been removed, renamed, or entered incorrectly.</p><Link className="button button-primary" href="/"><ArrowLeft aria-hidden size={15} />Back to Programs</Link></div></section></main>;
}
