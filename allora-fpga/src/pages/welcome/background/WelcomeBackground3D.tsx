import { Bloom, EffectComposer, SSAO } from "@react-three/postprocessing";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import * as THREE from "three";
import { CircuitBoard } from "./components/CircuitBoard";
import { FPGAChip } from "./components/FPGAChip";
import { LogicStructures } from "./components/LogicStructures";
import { RoutingNetwork } from "./components/RoutingNetwork";
import { SceneLighting } from "./components/SceneLighting";
import { SignalPulses } from "./components/SignalPulses";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { generateRoutingNetwork } from "./utils/routingGenerator";

export type WelcomeVisualMode = "idle" | "simulate" | "build";

type WelcomeBackground3DProps = {
  mode: WelcomeVisualMode;
};

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Allora welcome WebGL background unavailable; using fallback.", error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, pointer, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const portraitAdjustment = size.width / size.height < 1.55 ? 0.65 : 0;
    const wideViewportTarget = size.width >= 1900 ? -0.45 : 0.48;
    desired.set(
      reducedMotion ? 0 : pointer.x * 0.14,
      2.5 + portraitAdjustment + (reducedMotion ? 0 : pointer.y * 0.055),
      10.3 + portraitAdjustment * 0.6,
    );
    camera.position.lerp(desired, 0.035);
    target.set(0, wideViewportTarget, -2.5 - portraitAdjustment * 0.8);
    camera.lookAt(target);
  });

  return null;
}

function AlloraScene({ mode, reducedMotion }: { mode: WelcomeVisualMode; reducedMotion: boolean }) {
  const routes = useMemo(() => generateRoutingNetwork(), []);

  return (
    <>
      <color attach="background" args={["#02060a"]} />
      <fog attach="fog" args={["#03080d", 13, 36]} />
      <CameraRig reducedMotion={reducedMotion} />
      <SceneLighting />
      <CircuitBoard />
      <RoutingNetwork routes={routes} mode={mode} />
      <SignalPulses routes={routes} mode={mode} reducedMotion={reducedMotion} />
      <LogicStructures />
      <FPGAChip />
      <EffectComposer multisampling={0} enableNormalPass>
        <SSAO samples={16} rings={3} radius={8} intensity={0.62} luminanceInfluence={0.58} bias={0.32} />
        <Bloom intensity={0.1} luminanceThreshold={1.42} luminanceSmoothing={0.18} mipmapBlur radius={0.2} />
      </EffectComposer>
    </>
  );
}

export function WelcomeBackground3D({ mode }: WelcomeBackground3DProps) {
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  return (
    <div className={ready ? "welcome-3d-background is-ready" : "welcome-3d-background"} aria-hidden="true">
      <div className="welcome-3d-fallback" />
      <WebGLBoundary>
        <Canvas
          className="welcome-3d-canvas"
          camera={{ position: [0, 2.5, 10.3], fov: 42, near: 0.1, far: 70 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.setClearColor("#02060a", 1);
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
            setReady(true);
          }}
          shadows={{ type: THREE.PCFShadowMap }}
        >
          <Suspense fallback={null}>
            <AlloraScene mode={mode} reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </WebGLBoundary>
    </div>
  );
}
