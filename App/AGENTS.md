# Expo Mobile App — Development Guide

This is the **field technician inspection app** for the Spatiotemporal Anomaly Detection system. It displays maintenance tickets from the backend and allows technicians to submit inspection reports with photos.

**For overall project architecture, see the root [AGENTS.md](../AGENTS.md).**

---

## Quick Start

```bash
cd App
npm install
npm run start
# Scan QR code with Expo Go app or open in browser
```

---

## Tech Stack

- **Framework**: Expo v55.0.26 (React Native, cross-platform)
- **Navigation**: Expo Router (file-based routing)
- **Language**: TypeScript 5.3.3 (strict mode)
- **State**: AppContext (local state) + AsyncStorage (persistence)
- **Backend**: Supabase (real auth + ticket API wired; see [TICKETING_SYSTEM_DESIGN.md](../TICKETING_SYSTEM_DESIGN.md))
- **Styling**: React Native StyleSheet + inline styles
- **Build system**: Expo EAS (for APK/IPA builds)

⚠️ **CRITICAL**: Expo v55 has breaking changes from v56+. Always read https://docs.expo.dev/versions/v55.0.0/ before implementing.

---

## Project Structure

```
App/
├── app/                           ← Expo Router screens (file-based routing)
│   ├── _layout.tsx               ← Root navigation shell
│   ├── report.tsx                ← Report submission modal
│   ├── (tabs)/                   ← Tab-based navigation group
│   │   ├── _layout.tsx           ← Tab navigator shell
│   │   ├── index.tsx             ← Dashboard (active tickets)
│   │   ├── profile.tsx           ← Technician profile & settings
│   │   └── ticket-detail.tsx     ← Inspection form
│
├── components/                    ← Reusable UI components
│   ├── Button.tsx                ← Primary action button
│   ├── Card.tsx                  ← Container component
│   ├── Themed.tsx                ← Dark/light theme wrapper
│   └── useColorScheme.ts          ← Color scheme hook
│
├── context/                       ← State management
│   └── AppContext.tsx            ← Global state (auth, tickets, theme)
│
├── services/                      ← API integration
│   └── mockApi.ts                ← Mock ticket data (ready for real API)
│
├── constants/                     ← Theme & config
│   └── Colors.ts                 ← Dark/light color definitions
│
├── assets/                        ← Static files
│   ├── images/                   ← App icons & images
│   └── fonts/                    ← Custom fonts
│
├── package.json                   ← Node dependencies
├── app.json                       ← Expo configuration
├── tsconfig.json                  ← TypeScript config
├── AGENTS.md                      ← This file
├── CLAUDE.md                      ← References AGENTS.md
└── SUPABASE_README.md            ← Redirect → see root TICKETING_SYSTEM_DESIGN.md
```

---

## File-Based Routing (Expo Router)

Unlike traditional navigation, Expo Router uses **file system as router**.

### Navigation Structure
```
app/(tabs)/_layout.tsx
├── app/(tabs)/index.tsx          → Dashboard tab (/)
├── app/(tabs)/profile.tsx        → Profile tab (/profile)
└── app/(tabs)/ticket-detail.tsx  → Detail tab (/ticket-detail)

app/report.tsx                     → Modal (/report) — overlays on tabs
```

### Path Aliases
Use `@/` for clean imports:
```typescript
// ✅ Correct
import { Button } from '@/components/Button';
import { useApp } from '@/context/AppContext';

// ❌ Avoid
import { Button } from '../components/Button';
```

---

## Development Conventions

### Component Patterns

#### Functional Components with Hooks
```typescript
// ✅ CORRECT
import { FC } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';

interface MyComponentProps {
  label: string;
  onPress?: () => void;
}

export const MyComponent: FC<MyComponentProps> = ({ label, onPress }) => {
  const colors = useColorScheme();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.text }}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 8,
  },
});
```

#### State Management via AppContext
```typescript
// ✅ CORRECT
import { useApp } from '@/context/AppContext';

export function MyScreen() {
  const { user, tickets, setUser } = useApp();
  
  // Use context values directly
  return <Text>{user?.name}</Text>;
}
```

### Dark/Light Theme

**ALWAYS** respect theme when setting colors:

```typescript
// ✅ CORRECT
const colors = useColorScheme();
<View style={{ backgroundColor: colors.background }}>
  <Text style={{ color: colors.text }}>Hello</Text>
</View>

// ❌ WRONG — hardcoded colors
<View style={{ backgroundColor: '#ffffff' }}>
  <Text style={{ color: '#000000' }}>Hello</Text>
</View>
```

### TypeScript Interfaces

Define data shapes in component or context file:

```typescript
interface MaintenanceTicket {
  id: string;
  station_id: string;
  status: 'active' | 'pending' | 'approved';
  created_at: string;
  inspection_date?: string;
  notes?: string;
}

// Use in component
const tickets: MaintenanceTicket[] = [];
```

### AsyncStorage Patterns

Use AppContext for persistent state:

```typescript
// In AppContext.tsx
const loadUserFromStorage = async () => {
  const stored = await AsyncStorage.getItem('user');
  if (stored) setUser(JSON.parse(stored));
};

// In component
const { user } = useApp();  // Already loaded
```

---

## Screen Implementations

### Dashboard (`app/(tabs)/index.tsx`)
- **Purpose**: List active maintenance tickets for technician
- **Data source**: `mockApi.getTickets()` → will be `supabase.from('tickets').select()`
- **Features**: Tap ticket → navigate to detail screen
- **Theme**: Respects dark/light via `useColorScheme()`

### Ticket Detail (`app/(tabs)/ticket-detail.tsx`)
- **Purpose**: Inspection form for field work
- **Data source**: Selected ticket from AppContext
- **Features**:
  - Display station info (ID, location, last readings)
  - Text input for notes
  - Photo picker (ImagePicker API)
  - Submit button → triggers report modal
- **Validation**: Require notes + at least 1 photo before submit

### Profile (`app/(tabs)/profile.tsx`)
- **Purpose**: Technician info, logout, settings
- **Features**:
  - Display `user.name`, `user.email`
  - Toggle dark/light theme
  - Logout button → clear AppContext + navigate to login

### Report Modal (`app/report.tsx`)
- **Purpose**: Confirm + submit inspection to backend
- **Data source**: Form data from ticket detail screen
- **Features**:
  - Preview notes & photos
  - Confirm button → POST to Supabase (when wired)
  - Success/error feedback
  - Close modal → return to ticket detail

---

## API Integration (Mock Data → Supabase)

### Current (Mock Data)
```typescript
// services/mockApi.ts
export const getTickets = async () => {
  return [
    {
      id: 'T001',
      station_id: 'QC-001',
      status: 'active',
      created_at: new Date().toISOString(),
    },
  ];
};
```

### Planned (Supabase Real API)
See [TICKETING_SYSTEM_DESIGN.md](../TICKETING_SYSTEM_DESIGN.md) for database schema, auth setup, API reference, and setup steps.

Phase 1 is code-complete. Real API calls are in `services/supabaseApi.ts`; `mockApi.ts` is kept as fallback only.

---

## Build & Deployment

### Development Server
```bash
npm run start
# Opens Expo dev server on http://localhost:8081
# Scan QR or press 'i' (iOS), 'a' (Android), 'w' (web)
```

### Web Build
```bash
npm run web
# Opens app in default browser (useful for quick testing)
```

### iOS/Android Simulator
```bash
npm run ios     # Requires macOS + Xcode
npm run android # Requires Android Studio
```

### Production Build (EAS)
```bash
cd App
eas build --platform ios/android
# Requires EAS account (free tier available)
# Builds APK/IPA in Expo Cloud
```

---

## Hooks & Utilities

### useColorScheme
Auto-detects light/dark theme and provides color values:
```typescript
const colors = useColorScheme();
// colors.background, colors.text, colors.primary, etc.
```

### useClientOnlyValue (Platform Detection)
Avoid hydration mismatch when using platform-specific logic:
```typescript
const Component = useClientOnlyValue(() => PlatformSpecific, () => Fallback);
```

---

## Common Pitfalls

### ❌ Direct File Imports in Expo Router
```typescript
// ❌ WRONG — breaks routing
import MyScreen from '../screens/MyScreen';

// ✅ CORRECT — use href navigation
<Link href="/my-screen">Go to screen</Link>
```

### ❌ Mixing useEffect with Async
```typescript
// ❌ WRONG
useEffect(async () => {
  const data = await fetchData();
}, []);

// ✅ CORRECT
useEffect(() => {
  const load = async () => {
    const data = await fetchData();
    setData(data);
  };
  load();
}, []);
```

### ❌ Hardcoding Colors
```typescript
// ❌ WRONG — ignores theme
<View style={{ backgroundColor: '#fff' }} />

// ✅ CORRECT — respects theme
const colors = useColorScheme();
<View style={{ backgroundColor: colors.background }} />
```

### ❌ Missing Key Props in Lists
```typescript
// ❌ WRONG
{tickets.map((t) => <Ticket {...t} />)}

// ✅ CORRECT
{tickets.map((t) => <Ticket key={t.id} {...t} />)}
```

### ❌ Storing Sensitive Data in AsyncStorage
```typescript
// ❌ WRONG — AsyncStorage is not encrypted
await AsyncStorage.setItem('password', userPassword);

// ✅ CORRECT — use SecureStore for secrets
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('password', userPassword);
```

---

## Testing Notes

**Current approach**: Manual UI testing via Expo Go

**What to test**:
1. ✅ Screens render without errors
2. ✅ Navigation works (tap tab → screen updates)
3. ✅ Dark/light toggle works
4. ✅ Form inputs accept text
5. ✅ Photo picker opens camera/gallery
6. ✅ Modal opens/closes correctly

**Future**: Consider adding Jest + React Native Testing Library

---

## Debugging Tips

### Expo Go Console
```bash
# Terminal shows logs from app
npm run start
# Press 'j' in terminal to open debugger
```

### React DevTools
```bash
# Install
npm install -g @react-native-community/cli

# Debug (in web mode)
npm run web
# Open browser DevTools (F12)
```

### Network Inspector
```bash
# Monitor API calls
npm run start
# Press 'm' → toggle Network Inspector
```

---

## Version Constraints & Updates

⚠️ **DO NOT auto-update Expo past v55** — breaking changes in v56+

```bash
# Check current version
expo --version

# Update minor/patch (safe)
npm update expo expo-router react-native

# ❌ DO NOT do this — will break app
npm install expo@latest
```

---

## Related Documentation

- **Architecture Overview**: [../AGENTS.md](../AGENTS.md)
- **Backend Integration**: [TICKETING_SYSTEM_DESIGN.md](../TICKETING_SYSTEM_DESIGN.md)
- **Expo Official Docs**: https://docs.expo.dev/versions/v55.0.0/
- **React Native Docs**: https://reactnative.dev/
- **TypeScript in React Native**: https://www.typescriptlang.org/docs/
