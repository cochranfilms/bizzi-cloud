# Google Cloud: Allow Service Account Key Creation

The error **"Key creation is not allowed on this service account"** happens because your organization (`cochranfilms.com`) has a policy that blocks creating service account keys.

## Fix: Adjust the organization policy

You need **Organization Policy Administrator** at the org level. As Organization Administrator, you likely have this.

### 1. Open Organization Policies

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Use the **project selector** (top bar) and choose **"cochranfilms.com"** (the organization), not the project
3. In the left menu: **IAM & Admin** → **Organization Policies**
4. If you don't see "Organization Policies", open it from the org-level:  
   https://console.cloud.google.com/iam-admin/orgpolicies?organizationId=YOUR_ORG_ID

### 2. Find the restriction

1. Search for `disableServiceAccountKeyCreation` or browse for **"Disable service account key creation"**
2. Open that policy

### 3. Allow key creation (for your project)

1. Click **"Manage policy"** or **"Edit"**
2. Choose either:
   - **"Replace"** → set to **"Not enforced"** to allow key creation for the whole org  
   - Or **"Customize"** → add an **exception** for the `bizzi-cloud` project
3. Save

### 4. Create the Firebase service account key

1. Switch to project **bizzi-cloud**
2. Go to [Firebase Console](https://console.firebase.google.com) → Project Settings → Service Accounts
3. Click **"Generate new private key"**
4. Save the JSON file
5. Minify it and add it to Vercel as `FIREBASE_SERVICE_ACCOUNT_JSON`

## If you can’t change the policy

**Option A – Use a personal Firebase project**

Create a new Firebase project outside the org (e.g. a personal Google account). That project won’t inherit org policies. You’d need to update Firebase config and env vars to point to the new project.

**Option B – Workload Identity Federation (advanced)**

Use Workload Identity Federation instead of a key for Vercel. This is more complex and requires extra setup.
