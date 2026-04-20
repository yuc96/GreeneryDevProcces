import {
  DEFAULT_COMING_SOON,
  getComingSoonCopy,
} from "@/config/app-navigation";
import { UnderConstructionModule } from "@/components/shell/UnderConstructionModule";

export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const decoded = decodeURIComponent(moduleId);
  const fromConfig = getComingSoonCopy(decoded);
  const copy = fromConfig ?? {
    ...DEFAULT_COMING_SOON,
    moduleId: decoded,
  };
  return <UnderConstructionModule copy={{ ...copy, moduleId: decoded }} />;
}
