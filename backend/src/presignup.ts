import {
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { PreSignUpTriggerEvent } from 'aws-lambda'

const cognito = new CognitoIdentityProviderClient({})
const PROVIDERS = ['Google', 'Facebook']

async function usersWithEmail(poolId: string, email: string) {
  const res = await cognito.send(
    new ListUsersCommand({ UserPoolId: poolId, Filter: `email = "${email.replace(/"/g, '')}"`, Limit: 10 }),
  )
  return res.Users ?? []
}

// Cognito pre-sign-up trigger. One person = one account, whatever the sign-in method:
// - first sign-in with Google/... whose verified email already has a password account:
//   link it to that account, so points and streak are shared.
// - password sign-up with an email that already belongs to a social account: refuse with a hint.
export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  const email = event.request.userAttributes.email?.toLowerCase()
  if (!email) return event

  if (event.triggerSource === 'PreSignUp_ExternalProvider') {
    // userName looks like "Google_1234567890"
    const cut = event.userName.indexOf('_')
    const prefix = event.userName.slice(0, cut).toLowerCase()
    // Cognito may lowercase the prefix; linking needs the provider name exactly as configured
    const providerName = PROVIDERS.find((p) => p.toLowerCase() === prefix)
    const providerUserId = event.userName.slice(cut + 1)
    if (!providerName) return event
    const native = (await usersWithEmail(event.userPoolId, email)).find(
      (u) =>
        u.UserStatus !== 'EXTERNAL_PROVIDER' &&
        u.Attributes?.some((a) => a.Name === 'email_verified' && a.Value === 'true'),
    )
    if (native?.Username) {
      await cognito.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: event.userPoolId,
          DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: native.Username },
          SourceUser: { ProviderName: providerName, ProviderAttributeName: 'Cognito_Subject', ProviderAttributeValue: providerUserId },
        }),
      )
      // Cognito still fails this first attempt ("Already found an entry"); the web app retries once.
    }
    return event
  }

  if (event.triggerSource === 'PreSignUp_SignUp') {
    const social = (await usersWithEmail(event.userPoolId, email)).find((u) => u.UserStatus === 'EXTERNAL_PROVIDER')
    if (social) {
      const prefix = (social.Username ?? '').split('_')[0].toLowerCase()
      const provider = PROVIDERS.find((p) => p.toLowerCase() === prefix) ?? 'your social account'
      throw new Error(`This email already has an account. Sign in with ${provider} instead.`)
    }
  }
  return event
}
