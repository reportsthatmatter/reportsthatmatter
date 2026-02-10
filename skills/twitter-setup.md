# Twitter/X Account Setup

Step-by-step instructions for creating a new Twitter/X account with a custom domain email via Cloudflare Email Routing.

---

## Configuration

Fill in these values before starting:

```yaml
# Email setup
domain: reportsthatmatter.org           # Domain you control in Cloudflare
new_email: hello@reportsthatmatter.org  # Email address to create
forward_to: YOUR_PERSONAL_EMAIL         # Where emails should forward

# Twitter account
twitter_handle: ReportsThatMatter       # Desired handle (will check availability)
twitter_display_name: Reports that Matter
twitter_bio: "Excerpts from public-interest reports. Evidence first. No commentary."
twitter_website: https://reportsthatmatter.org

# Cloudflare credentials (for API automation)
cloudflare_account_id: YOUR_ACCOUNT_ID
cloudflare_zone_id: YOUR_ZONE_ID        # Zone ID for the domain
cloudflare_api_token: YOUR_API_TOKEN    # Token with Email Routing permissions
```

---

## Part 1: Create Email Address (Cloudflare)

### Prerequisites
- Domain already added to Cloudflare
- Email Routing enabled for the domain (Dashboard → Email → Email Routing)

### Step 1.1: Add Destination Address

The email you forward TO must be verified first.

**Manual (Dashboard):**
1. Go to Cloudflare Dashboard → Email → Email Routing
2. Click "Destination addresses"
3. Add `{{forward_to}}` and click "Add destination"
4. Check your inbox and click the verification link

**Automated (API):**
```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{{cloudflare_account_id}}/email/routing/addresses" \
  -H "Authorization: Bearer {{cloudflare_api_token}}" \
  -H "Content-Type: application/json" \
  -d '{"email": "{{forward_to}}"}'
```
⚠️ **Manual step required:** You must click the verification link sent to `{{forward_to}}`.

### Step 1.2: Create Routing Rule

Create a rule to forward `{{new_email}}` to `{{forward_to}}`.

**Manual (Dashboard):**
1. Go to Email → Email Routing → Routing rules
2. Click "Create address"
3. Custom address: `hello` (the part before @)
4. Action: Forward to `{{forward_to}}`
5. Save

**Automated (API):**
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/{{cloudflare_zone_id}}/email/routing/rules" \
  -H "Authorization: Bearer {{cloudflare_api_token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "actions": [{"type": "forward", "value": ["{{forward_to}}"]}],
    "matchers": [{"type": "literal", "field": "to", "value": "{{new_email}}"}],
    "enabled": true,
    "name": "Forward {{new_email}} to {{forward_to}}"
  }'
```

### Step 1.3: Verify Email Works

**Manual test:**
1. Send a test email to `{{new_email}}` from another account
2. Confirm it arrives at `{{forward_to}}`

---

## Part 2: Create Twitter/X Account

### Prerequisites
- Working email address from Part 1
- Phone number for verification (Twitter requires this)

### Step 2.1: Sign Up

**Manual (Browser):**
1. Go to https://twitter.com/i/flow/signup
2. Click "Create account"
3. Enter display name: `{{twitter_display_name}}`
4. Enter email: `{{new_email}}`
5. Enter birth date (required, can use any valid date)
6. Click "Next"

**Automation notes:**
- Twitter has anti-bot protections; browser automation (Playwright/Puppeteer) may trigger CAPTCHAs
- No official API for account creation
- Manual is most reliable for initial setup

### Step 2.2: Verify Email

1. Check `{{forward_to}}` for verification code from Twitter
2. Enter the 6-digit code on Twitter

⚠️ **Manual step required:** Must retrieve code from email.

### Step 2.3: Set Password

1. Create a strong password
2. Store securely (password manager recommended)

### Step 2.4: Choose Handle

1. Twitter will suggest handles based on display name
2. Try `{{twitter_handle}}`
3. If taken, try variations: `{{twitter_handle}}_`, `The{{twitter_handle}}`, etc.

### Step 2.5: Complete Onboarding

1. Skip or complete profile photo upload
2. Skip or complete "Follow suggestions"
3. Skip or complete "Turn on notifications"

### Step 2.6: Phone Verification

Twitter may require phone verification:
1. Enter phone number
2. Receive SMS code
3. Enter code

⚠️ **Manual step required:** SMS verification cannot be automated without a phone number API.

---

## Part 3: Configure Profile

### Step 3.1: Set Bio and Website

**Manual (Browser):**
1. Go to Profile → Edit profile
2. Bio: `{{twitter_bio}}`
3. Website: `{{twitter_website}}`
4. Save

**Automated (Twitter API - requires developer account):**
```bash
# Requires OAuth 1.0a authentication
curl -X POST "https://api.twitter.com/1.1/account/update_profile.json" \
  -H "Authorization: OAuth ..." \
  -d "description={{twitter_bio}}&url={{twitter_website}}"
```

### Step 3.2: Set Profile Picture (Optional)

1. Upload a logo or image representing the account
2. Recommended size: 400x400px

### Step 3.3: Set Header Image (Optional)

1. Upload a header image
2. Recommended size: 1500x500px

### Step 3.4: Create Pinned Tweet

Draft for pinned tweet:
```
This account shares excerpts from important public reports — government inquiries, investigations, official findings.

No spin. Just the source.

First up: The Special Counsel Report on January 6.
```

1. Post the tweet
2. Click "..." on the tweet → "Pin to your profile"

---

## Part 4: Developer Access (Optional - for automation)

If you want to automate posting via API:

### Step 4.1: Apply for Developer Account

1. Go to https://developer.twitter.com/
2. Sign in with the new account
3. Click "Sign up for Free Account"
4. Describe your use case (e.g., "Automated posting of excerpts from public reports")
5. Accept terms

### Step 4.2: Create App

1. Go to Developer Portal → Projects & Apps
2. Create a new App
3. Set permissions to "Read and Write"
4. Generate API keys and tokens
5. Store securely:
   - API Key
   - API Secret
   - Access Token
   - Access Token Secret

---

## Automation Summary

| Step | Can Automate? | Tool |
|------|---------------|------|
| 1.1 Add destination address | ✅ Partial | Cloudflare API (verification link manual) |
| 1.2 Create routing rule | ✅ Yes | Cloudflare API |
| 2.1-2.6 Twitter signup | ⚠️ Risky | Browser automation (CAPTCHA issues) |
| 3.1 Set bio/website | ✅ Yes | Twitter API (requires dev account) |
| 3.4 Post pinned tweet | ✅ Yes | Twitter API |
| 4.x Developer setup | ❌ No | Manual only |

---

## Checklist

- [ ] **Part 1: Email**
  - [ ] Destination address added and verified
  - [ ] Routing rule created
  - [ ] Test email received
- [ ] **Part 2: Twitter Account**
  - [ ] Account created
  - [ ] Email verified
  - [ ] Handle secured: @__________
  - [ ] Phone verified
- [ ] **Part 3: Profile**
  - [ ] Bio set
  - [ ] Website set
  - [ ] Pinned tweet posted
- [ ] **Part 4: Developer (optional)**
  - [ ] Developer account approved
  - [ ] API keys generated and stored

---

## References

- [Cloudflare Email Routing Docs](https://developers.cloudflare.com/email-routing/)
- [Cloudflare Email Routing API](https://developers.cloudflare.com/api/resources/email_routing/)
- [Twitter Developer Portal](https://developer.twitter.com/)
- [Twitter API v2 Docs](https://developer.twitter.com/en/docs/twitter-api)
