# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-03-31

### Added
- **Swarm Builder**: New onboarding flow for multi-agent configuration.
- **Git Integration**: Basic staging and commit support within the UI.
- **Server Discovery**: Automatically detects background services and logs.
- **WebGL Rendering**: High-performance terminal rendering via xterm.js WebGL addon.

### Changed
- Refined **Campbell** theme colors for better contrast.
- Improved terminal resizing logic for smoother PTY reflow.

### Fixed
- Fixed a bug where browser tiles would occasionally hang on resize.
- Corrected path mapping for WSL environments.

## [0.1.1] - 2026-02-15

### Added
- Basic WSL support for terminal sessions.
- Workspace file explorer with framework-specific icons.

### Fixed
- Fixed IPC event naming inconsistency between frontend and backend.

## [0.1.0] - 2026-01-10

### Added
- Initial release of Lattice.
- Multiplexed grid workspace for terminal sessions.
- Rust-powered PTY backend using `portable-pty`.
- SolidJS reactive UI foundation.

---

[0.1.2]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.2
[0.1.1]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.1
[0.1.0]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.0
