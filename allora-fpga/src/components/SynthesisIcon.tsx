type SynthesisIconProps = {
  size?: number;
};

export default function SynthesisIcon({ size = 18 }: SynthesisIconProps) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 125 460 210" fill="currentColor" aria-hidden="true">
      <path d="M460,215H303.924c-7.301-50.816-51.119-90-103.924-90H90c-8.284,0-15,6.716-15,15v30H0v30h75v60H0v30h75 v30c0,8.284,6.716,15,15,15h110c52.805,0,96.623-39.184,103.924-90H460V215z M200,305h-95V155h95c41.355,0,75,33.645,75,75 S241.355,305,200,305z" />
    </svg>
  );
}
