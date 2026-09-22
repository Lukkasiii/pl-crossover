import { useParams } from "react-router-dom";
import { PlaceholderPage } from "./PlaceholderPage";

export default function TeamDetail() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <PlaceholderPage
      titleKey="placeholder.teamDetail.title"
      bodyKey="placeholder.teamDetail.body"
      params={{ slug: slug ?? "" }}
      testid="page-team-detail"
    />
  );
}
