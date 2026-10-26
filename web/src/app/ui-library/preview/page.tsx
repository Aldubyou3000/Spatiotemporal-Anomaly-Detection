import { notFound } from "next/navigation";
import { ComponentPreview } from "@/components/design/ComponentPreview";

export default function LibraryPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ComponentPreview />;
}
