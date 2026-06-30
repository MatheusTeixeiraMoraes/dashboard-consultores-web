import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import UploadClient from './UploadClient'

export default async function UploadPage() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dono')) {
    redirect('/dashboard')
  }
  return <UploadClient uploadedBy={profile.id} />
}
