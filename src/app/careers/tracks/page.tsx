import { permanentRedirect } from "next/navigation";

/** /careers/tracks has no page of its own: the track filters live on /careers. */
export default function TracksIndexPage() {
  permanentRedirect("/careers");
}
