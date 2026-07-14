# Shoe Box

## Overview

Shoe Box is a static web application built with React and Vite, deployed via Firebase Hosting. The project appears to be a shoe-related application (likely inventory, collection tracking, or e-commerce) that uses Firebase for backend services including Realtime Database and Analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React (bundled with Vite)
- **Build Output**: Pre-compiled static assets in `/public/assets/` directory
- **Styling**: Tailwind CSS with custom fonts (Inter, Oswald, DM Sans, Fira Code, Geist Mono, Architects Daughter)
- **Entry Point**: `/public/index.html` loads the bundled React app

### Hosting & Deployment
- **Platform**: Firebase Hosting
- **Configuration**: Serves static files from `/public` directory
- **Ignored Files**: firebase.json, dotfiles, and node_modules are excluded from deployment

### Data Layer
- **Database**: Firebase Realtime Database (configured but implementation details not visible in static build)
- **Purpose**: Likely stores shoe collection/inventory data

### Analytics
- **Service**: Firebase Analytics (Google Analytics 4)
- **Measurement ID**: G-794PS13DYF

## External Dependencies

### Firebase Services
| Service | Purpose |
|---------|---------|
| Firebase Hosting | Static site hosting and deployment |
| Firebase Realtime Database | Data persistence for application state |
| Firebase Analytics | User behavior and engagement tracking |

### CDN Resources
- Firebase SDK loaded from `gstatic.com` (v12.8.0)
- Google Fonts API for typography

### Build Tools
- Vite (inferred from asset naming convention and build output)
- The source code is pre-compiled; development files (src/, package.json) are not present in this repository snapshot

### Notes for Development
- The repository contains only the production build output
- To make changes, you'll need to either:
  1. Locate the source repository with React components
  2. Rebuild the frontend from scratch if source is unavailable
- Firebase configuration is exposed in client-side code (normal for Firebase web apps)