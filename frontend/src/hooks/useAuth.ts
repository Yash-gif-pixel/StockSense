import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  ForgotPasswordResponse,
  LoginBody,
  ResetPasswordBody,
  SignupBody,
  User,
} from '@/api/types'

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<User>('/auth/me'),
    staleTime: 5 * 60_000,
  })
}

/** True once GET /api/auth/me succeeds; false while it runs and when signed out. Used by public
 *  pages (the landing) to swap Sign in / Get started for Open dashboard. */
export function useSignedIn() {
  return !!useMe().data
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginBody) => api.post<User>('/auth/login', body),
    onSuccess: (user) => {
      // Fresh session: drop anything cached for a previous user, then seed "me".
      qc.clear()
      qc.setQueryData(qk.me, user)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => qc.clear(),
  })
}

export function useSignup() {
  return useMutation({
    mutationFn: (body: SignupBody) => api.post<User>('/auth/signup', body),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) => api.post<void>('/auth/change-password', body),
  })
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordBody) => api.post<ForgotPasswordResponse>('/auth/forgot-password', body),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordBody) => api.post<void>('/auth/reset-password', body),
  })
}
