import InfoCard from "./InfoCard";

type PlaceholderSectionProps = {
  title: string;
  description: string;
};

export default function PlaceholderSection({
  title,
  description,
}: PlaceholderSectionProps) {
  return (
    <InfoCard title={title} pageTitle>
      <p
        style={{
          margin: 0,
          color: "var(--ui-text-muted)",
          fontSize: "17px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </InfoCard>
  );
}
