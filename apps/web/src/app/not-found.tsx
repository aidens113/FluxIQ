import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return <main className="directory-page"><section className="route-recovery-surface"><span className="program-icon"><SearchX aria-hidden size={20} /></span><div><p className="page-kicker">Not found</p><h1 className="page-title">That page is not available</h1><p className="page-copy">The page may have moved, or the address may have a typing mistake.</p><Link className="button button-primary" href="/"><ArrowLeft aria-hidden size={15} />Go to Home</Link></div></section></main>;
}
