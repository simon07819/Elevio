# Elevio — App Store Submission Checklist

## 1. App Information

| Field | Value |
|---|---|
| **App Name** | Elevio |
| **Subtitle** | Smart construction elevator management |
| **Primary Category** | Business |
| **Secondary Category** | Productivity |
| **Bundle ID** | com.elevio.app |
| **Version** | 1.0 |
| **Minimum iOS** | 15.0 |
| **Age Rating** | 4+ (no violence, no gambling, no user-generated content) |

---

## 2. Description

### Short Description (170 chars max)
Smart elevator dispatch for construction sites. Scan QR, request elevator, track in real time. Reduce wait times and optimize operator performance.

### Long Description

Elevio transforms construction elevator management with smart, real-time dispatch.

**How it works:**

1. **Passenger scans a QR code** posted on each floor — no app download needed for basic use
2. **Operator receives the request instantly** on their terminal — accept, skip, or mark full
3. **Everyone sees real-time status** — boarding, in transit, completed

**Key features:**

- QR-based floor requests — passengers just scan, no training needed
- Real-time operator terminal with smart dispatch
- Analytics dashboard — see wait times, peak hours, efficiency score
- Multi-operator support for large sites
- Works offline — actions queue and sync when connectivity returns
- English and French interface

**Plans:**

- Starter ($199/mo): 1 project, 2 operators, basic analytics
- Pro ($499/mo): 3 projects, 10 operators, advanced analytics, efficiency score, business insights
- Enterprise: unlimited, custom support, SLA, activation codes

Built for general contractors, elevator operators, and site managers who want to eliminate elevator bottlenecks.

---

## 3. Keywords

construction, elevator, chantier, logistics, building, dispatch, QR, hoist, site management

---

## 4. Support URL

- **Support URL**: https://elevio.app/support
- **Marketing URL**: https://elevio.app
- **Privacy Policy URL**: https://elevio.app/privacy

---

## 5. Privacy Description (for App Store Connect)

Elevio collects minimal data to provide its service:

- **Email address** — for account creation and login
- **Project and floor data** — entered by site administrators to configure the system
- **Elevator request data** — created when passengers scan QR codes and operators process requests
- **Device identifier** — used to prevent duplicate passenger requests (not for tracking)
- **Analytics data** — aggregate wait times, request counts, peak hours (no personal identifiers)

We do NOT collect:
- Location data
- Contact lists
- Photos or camera images (QR scanning is processed locally, no images stored)
- Health data
- Browsing history

All data is stored securely on our servers in Canada. Data is never sold to third parties. Users can request account deletion by contacting support.

---

## 6. Review Notes

**Dear App Review Team,**

This app is a B2B construction elevator dispatch tool. Here is how it works:

### User Flow:

1. **Passenger (no login required)**: Scans a QR code on their floor → elevator request is created → sees real-time status (waiting, boarded, completed)

2. **Operator (login required)**: Opens the operator terminal → sees incoming requests → accepts/skips/marks as full → request is updated in real time

3. **Admin (login required)**: Manages projects, floors, QR codes → views analytics dashboard → configures settings

### Payment Compliance:

- **iOS payments use Apple In-App Purchase only** (via RevenueCat SDK)
- **No Stripe, no external payment links, no external checkout** on iOS
- The "Enterprise" plan uses activation codes (no payment flow — codes are pre-purchased via separate sales contract)
- All subscribe buttons on iOS launch the Apple IAP sheet
- No "pay on website" text appears on iOS
- No email links for sales contact on iOS (only activation codes)

### QR Scanning:

- The app uses the device camera to scan QR codes
- QR scanning is done locally via Capacitor camera plugin
- No photos are captured or stored
- No facial recognition or biometric processing

### Account Login:

- Email/password authentication via Supabase Auth
- No social login (Apple Sign-In capability exists but is not required)

### What the reviewer will see:

- Open the app → Welcome screen → Tap "Scan QR" or "Operator" or "Administration"
- QR scan page works without login
- Operator page requires login (use any email/password)
- Admin page requires admin login
- Paywall appears only when tapping "Subscribe" in the admin section — this launches the Apple IAP sheet

### Test Account:

(Provide test credentials in App Store Connect's review notes section)

---

## 7. App Store Compliance Checklist

- [x] Bundle ID: com.elevio.app
- [x] App name: Elevio
- [x] No debug flags in Release build
- [x] Minimum iOS 15.0
- [x] Camera usage: QR scanning only, no photo storage
- [x] No location services requested
- [x] No Stripe on iOS — RevenueCat IAP only
- [x] No external payment links on iOS
- [x] No "pay on website" text on iOS
- [x] No mailto: links on iOS (Enterprise uses activation codes only)
- [x] Homepage (/) opens QR scan — no marketing landing page
- [x] No paywall at app launch
- [x] Passenger QR flow works without login or payment
- [x] Server-side Stripe guard (checks User-Agent for iOS)
- [x] Client-side Stripe guard (isIOS() early return before any Stripe call)
- [x] Plans use Apple IAP product IDs (com.elevio.starter.monthly, com.elevio.pro.monthly)
- [x] Privacy policy URL available
- [x] Support URL available
- [x] App description does not mention external pricing
- [x] Subscription pricing visible in IAP sheet (Apple displays this)
