import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!

export function signUserToken(userId: string): string {
  return jwt.sign(
    { sub: userId, role: 'user', iss: 'ppmate-client' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '2h' }
  )
}

export function signCompanionToken(companionId: string): string {
  return jwt.sign(
    { sub: companionId, role: 'companion', iss: 'ppmate-client' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '2h' }
  )
}

export function signAdminToken(adminId: string, role: string = 'super_admin'): string {
  return jwt.sign(
    { sub: adminId, role, iss: 'ppmate-admin' },
    ADMIN_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '8h' }
  )
}
