import { useId, useLayoutEffect, useRef, useState } from "react";
import "./GradientOutline.css";

/** Measure in layout pixels so a wide surface keeps circular corners and a uniform stroke. */
export default function GradientOutline({ className = "", radius = 14, strokeWidth = 1.5, trail = false }: {
  className?: string;
  radius?: number;
  strokeWidth?: number;
  trail?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = `outline-${useId().replace(/:/g, "")}`;
  useLayoutEffect(() => {
    const element = svg.current!;
    const measure = () => setSize(previous => {
      const width = element.clientWidth, height = element.clientHeight;
      return previous.width === width && previous.height === height ? previous : { width, height };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const inset = strokeWidth / 2;
  return <svg ref={svg} className={`ui-gradient-outline${trail ? " ui-gradient-outline--trail" : ""} ${className}`} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} aria-hidden="true" fill="none" focusable="false">
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
      <stop className="outline-blue" offset="0%" />
      <stop className="outline-violet" offset="50%" />
      <stop className="outline-cyan" offset="100%" />
    </linearGradient></defs>
    {size.width > strokeWidth && size.height > strokeWidth && <rect x={inset} y={inset} width={size.width - strokeWidth} height={size.height - strokeWidth}
      rx={radius} pathLength={trail ? 100 : undefined} stroke={`url(#${gradientId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />}
  </svg>;
}
