## [0.3.1](https://github.com/YuvalHir/Lattice/compare/v0.3.0...v0.3.1) (2026-04-12)


### Bug Fixes

* resolve TypeScript errors and unused code in frontend ([489b37e](https://github.com/YuvalHir/Lattice/commit/489b37e600339c5c9dd3c1596c601564ca49b2fd))

# [0.3.0](https://github.com/YuvalHir/Lattice/compare/v0.2.2...v0.3.0) (2026-04-12)


### Features

* implement cross-platform support and enhance terminal orchestration ([8bc2dcd](https://github.com/YuvalHir/Lattice/commit/8bc2dcd93a357b89f8b0fc3cce598f08dc988f3c))

## [0.2.2](https://github.com/YuvalHir/Lattice/compare/v0.2.1...v0.2.2) (2026-04-11)


### Bug Fixes

* robust terminal scroll preservation using persistent registry ([8212608](https://github.com/YuvalHir/Lattice/commit/82126088ffd2b8fc0740935f14b63be1fec483b3))


### Performance Improvements

* optimize terminal buffer memory and preserve scroll position ([458e8ee](https://github.com/YuvalHir/Lattice/commit/458e8eef7273482fb8edc4d05401ecb3b85123a3))

## [0.2.1](https://github.com/YuvalHir/Lattice/compare/v0.2.0...v0.2.1) (2026-04-11)


### Bug Fixes

* resolve terminal double-pasting and '1;1R' artifacts ([9820a10](https://github.com/YuvalHir/Lattice/commit/9820a10054dd8047dd2e226166713e7765c90cac))

# [0.2.0](https://github.com/YuvalHir/Lattice/compare/v0.1.12...v0.2.0) (2026-04-11)


### Features

* add sidebar home navigation and quick-cd support in launcher ([c0a4be5](https://github.com/YuvalHir/Lattice/commit/c0a4be5888f98151f5d73ee928e9af29305f7a06))

## [0.1.12](https://github.com/YuvalHir/Lattice/compare/v0.1.11...v0.1.12) (2026-04-11)


### Bug Fixes

* **ci:** remove node cache as package-lock.json is ignored ([aa0570d](https://github.com/YuvalHir/Lattice/commit/aa0570de1be287f947c8ef26cf959af36124302d))
* ensure tauri build uses updated version from semantic-release tag ([76354f7](https://github.com/YuvalHir/Lattice/commit/76354f77cd80504d47362106c9daa197078ff735))
* redo version 0.1.12 with corrected tauri.conf and ci ([4cd34bd](https://github.com/YuvalHir/Lattice/commit/4cd34bd00eacbfc9e3e713b309aaaeb2de2da571))
* sync tauri.conf.json version and automate updates in semantic-release ([89827b4](https://github.com/YuvalHir/Lattice/commit/89827b4b6a7588a054183f91d520dc2af72fdcf6))
* trigger release with updated tauri.conf and ci config ([7b1e55b](https://github.com/YuvalHir/Lattice/commit/7b1e55b31ec38a0a46469dc00c43e5ae3ff98b35))

## [0.1.12](https://github.com/YuvalHir/Lattice/compare/v0.1.11...v0.1.12) (2026-04-11)


### Bug Fixes

* **ci:** remove node cache as package-lock.json is ignored ([aa0570d](https://github.com/YuvalHir/Lattice/commit/aa0570de1be287f947c8ef26cf959af36124302d))
* ensure tauri build uses updated version from semantic-release tag ([76354f7](https://github.com/YuvalHir/Lattice/commit/76354f77cd80504d47362106c9daa197078ff735))
* sync tauri.conf.json version and automate updates in semantic-release ([89827b4](https://github.com/YuvalHir/Lattice/commit/89827b4b6a7588a054183f91d520dc2af72fdcf6))
* trigger release with updated tauri.conf and ci config ([7b1e55b](https://github.com/YuvalHir/Lattice/commit/7b1e55b31ec38a0a46469dc00c43e5ae3ff98b35))

## [0.1.12](https://github.com/YuvalHir/Lattice/compare/v0.1.11...v0.1.12) (2026-04-11)


### Bug Fixes

* **ci:** remove node cache as package-lock.json is ignored ([aa0570d](https://github.com/YuvalHir/Lattice/commit/aa0570de1be287f947c8ef26cf959af36124302d))
* ensure tauri build uses updated version from semantic-release tag ([76354f7](https://github.com/YuvalHir/Lattice/commit/76354f77cd80504d47362106c9daa197078ff735))
* sync tauri.conf.json version and automate updates in semantic-release ([89827b4](https://github.com/YuvalHir/Lattice/commit/89827b4b6a7588a054183f91d520dc2af72fdcf6))

## [0.1.11](https://github.com/YuvalHir/Lattice/compare/v0.1.10...v0.1.11) (2026-04-11)


### Bug Fixes

* integrate semantic-release and tauri-build into a single secure pipeline ([c585457](https://github.com/YuvalHir/Lattice/commit/c585457980b9f35407fd89d0a1f2b1f67c589db2))

## [0.1.10](https://github.com/YuvalHir/Lattice/compare/v0.1.9...v0.1.10) (2026-04-11)


### Bug Fixes

* allow custom release token to trigger downstream workflows ([0c78280](https://github.com/YuvalHir/Lattice/commit/0c782803ce9539756fb0c30c5bb69da93694e695))

## [0.1.9](https://github.com/YuvalHir/Lattice/compare/v0.1.8...v0.1.9) (2026-04-11)


### Bug Fixes

* update release rules to trigger on chore and perf commits ([c1c0d84](https://github.com/YuvalHir/Lattice/commit/c1c0d84159ca701a8bb9d8052cab9e6a3c9fda89))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2026-04-11

### Added
- **Native Clipboard Support**: Implemented `Ctrl+V` (Paste) and `Ctrl+C` (Copy) within terminal tiles for a seamless "native" experience.

### Changed
- **Performance (Agent Spawning)**: Optimized Linux agent loading by removing login shell overhead (`-lc` -> `-c`), significantly reducing startup latency.
- **Performance (Terminal)**: Optimized the terminal input pipeline using binary `Uint8Array` to bypass expensive object conversions and improved layout recovery pulses.
- **Backend (Resource Monitoring)**: Integrated a persistent `sysinfo` System object in the backend to optimize RAM and service discovery polling, reducing CPU spikes.
- **CI/CD**: Implemented Rust and NPM caching in GitHub Actions to drastically reduce build times.
- **CI/CD**: Unified CI and Release workflows to use `ubuntu-latest` and robust GDK detection for Linux builds.

### Fixed
- **CI/CD (Linux)**: Resolved `gdk-sys` compilation errors on Ubuntu by correctly configuring `pkg-config` paths and adding missing development headers.
- **CI/CD (macOS)**: Fixed macOS release failures by removing mandatory Apple signing requirements for non-developer account builds.

## [0.1.7] - 2026-04-09

### Fixed
- **Version References**: Corrected all version references to 0.1.7 across configuration files.

### Changed
- **CI/CD**: Simplified release workflow and fixed permissions for release creation.

## [0.1.6] - 2026-04-04

### Added
- **Application Theme System**: 6 built-in themes (GitHub Dark, Dracula, Monokai, Nord, One Dark, GitHub Light) with live preview in settings.
- **Workspace History**: Save and relaunch previous workspace configurations from recent history.
- **Terminal Splitting**: Split terminals within a workspace and add multiple terminals per session.
- **ESC Key Support**: Close modals and dialogs with Escape key across all components.

### Fixed
- **Process Cleanup**: Robust verification that WSL agent processes are properly terminated when closing workspaces.

## [0.1.5] - 2026-04-03

### Fixed
- **Windows Aesthetic**: Prevent flashing console windows when spawning background processes (SCM, Service Polling, Taskkill).
- **Process Management**: Implemented `CREATE_NO_WINDOW` flag for all internal shell commands on Windows.

## [0.1.4] - 2026-04-02

### Changed
- **Performance**: Implemented throttled terminal emitter (20ms) to reduce IPC pressure.
- **Robustness**: Added stream-safe UTF-8 buffering to prevent garbled characters in terminal output.

## [0.1.3] - 2026-03-31

### Fixed
- **Auto-Updater**: Corrected endpoint configuration for GitHub releases.

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

[0.1.8]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.8
[0.1.7]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.7
[0.1.6]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.6
[0.1.5]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.5
[0.1.4]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.4
[0.1.3]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.3
[0.1.2]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.2
[0.1.1]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.1
[0.1.0]: https://github.com/YuvalHir/Lattice/releases/tag/v0.1.0
