# Allora FPGA

A modern FPGA development environment that automatically understands your board, FPGA, pins, clocks, and toolchain.

## Vision

Traditional FPGA development tools are FPGA-centric.

Allora FPGA is board-centric.

Choose your board first:

```text
ULX3S
iCEBreaker
OrangeCrab
Arty A7
```

and Allora FPGA automatically provides:

- FPGA information
- Pin mappings
- Clock definitions
- Constraint generation
- Toolchain configuration

## Current Features

### Project Creation

Create projects based on a selected FPGA board.

### Multi-File Editor

- Multiple HDL tabs
- Create new files
- Rename files
- Close files

### Board Database

```ts
{
  name: "ULX3S",
  vendor: "Lattice",
  family: "ECP5",
  device: "LFE5U-45F"
}
```

## Planned Features

- Automatic Constraint Generation
- Automatic Pin Mapping
- Integrated Synthesis
- Bitstream Generation
- Device Programming
- Simulation
- Comprehensive FPGA Database

## Technology Stack

- React
- TypeScript
- Tauri
- Vite

## Roadmap

### Phase 1

- [x] Board selection
- [x] Project creation
- [x] Dashboard
- [x] Multi-file editor
- [x] Board database foundation

### Phase 2

- [ ] Complete board database
- [ ] Complete FPGA database
- [ ] Pin mapping engine
- [ ] Constraint generation
- [ ] Synthesis integration

### Phase 3

- [ ] Bitstream generation
- [ ] Device programming
- [ ] Simulation tools

## License

MIT