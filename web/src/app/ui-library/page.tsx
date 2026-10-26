import { notFound } from "next/navigation";
import { DesignLibrary } from "@/components/design/DesignLibrary";

export default function UILibraryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignLibrary />;
}
