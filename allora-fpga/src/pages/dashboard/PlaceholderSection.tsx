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
    <InfoCard title={title}>
      <p
        style={{
          margin: 0,
          color: "#64748b",
          fontSize: "17px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </InfoCard>
  );
}
