import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { useAction } from '../lib/api';
import { Avatar, resizeImage } from '../components/Avatar';
import { Button, useToast } from '../components/ui';

// THE-SYSTEM's cinematic onboarding: detect → identify → face → covenant.
type Step = 'detect' | 'name' | 'photo' | 'body' | 'covenant';

const Line = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.8 }} className={className}>{children}</motion.p>
);

export function Awakening() {
  const [step, setStep] = useState<Step>('detect');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [height, setHeight] = useState('167');
  const [weight, setWeight] = useState('75');
  const fileRef = useRef<HTMLInputElement>(null);
  const action = useAction();
  const toast = useToast();

  const finish = () =>
    action.mutate(
      {
        method: 'PUT', path: '/profile',
        body: {
          name: name.trim(), avatar, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, onboarded: true,
          heightCm: Number(height) || null, ...(Number(weight) ? { weightKg: Number(weight) } : {}),
        },
      },
      { onError: (e) => toast(e.message, 'bad') },
    );

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
          {step === 'detect' && (
            <button className="w-full" onClick={() => setStep('name')}>
              <Line className="label mb-6 !text-accent">[ System notification ]</Line>
              <Line delay={0.6} className="font-display text-2xl font-bold leading-relaxed tracking-wider">THE SYSTEM HAS DETECTED A CANDIDATE.</Line>
              <Line delay={1.8} className="mt-6 text-ink2">You have acquired the qualifications to be a Player.</Line>
              <Line delay={3} className="mt-16 text-xs text-muted">Tap to continue</Line>
            </button>
          )}

          {step === 'name' && (
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep('photo'); }}>
              <Line className="mb-8 font-display text-2xl font-bold tracking-wider">IDENTIFY YOURSELF.</Line>
              <input className="field text-center text-lg font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} autoFocus />
              <Button type="submit" className="mt-6 w-full" disabled={!name.trim()}>Confirm</Button>
            </form>
          )}

          {step === 'photo' && (
            <div>
              <Line className="mb-8 font-display text-2xl font-bold tracking-wider">SHOW YOUR FACE.</Line>
              <button onClick={() => fileRef.current?.click()} className="relative mx-auto block">
                <Avatar src={avatar} name={name} rank="E" size={120} />
                <span className="absolute bottom-3 right-3 rounded-full bg-accent p-2 text-white"><Camera size={16} /></span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setAvatar(await resizeImage(f)); }} />
              <p className="mt-4 text-sm text-ink2">Your aura grows with every rank.</p>
              <Button className="mt-8 w-full" onClick={() => setStep('body')}>{avatar ? 'Continue' : 'Skip for now'}</Button>
            </div>
          )}

          {step === 'body' && (
            <form onSubmit={(e) => { e.preventDefault(); setStep('covenant'); }}>
              <Line className="mb-8 font-display text-2xl font-bold tracking-wider">MEASURE THE VESSEL.</Line>
              <div className="grid grid-cols-2 gap-3 text-left">
                <label><span className="label mb-1.5 block">Height (cm)</span>
                  <input type="number" className="field text-center text-lg font-bold" value={height} onChange={(e) => setHeight(e.target.value)} min={50} max={260} />
                </label>
                <label><span className="label mb-1.5 block">Weight (kg)</span>
                  <input type="number" step="0.1" inputMode="decimal" className="field text-center text-lg font-bold" value={weight} onChange={(e) => setWeight(e.target.value)} min={20} max={400} />
                </label>
              </div>
              <p className="mt-4 text-sm text-ink2">Weight can be updated anytime with the pen beside it.</p>
              <Button type="submit" className="mt-8 w-full">Continue</Button>
            </form>
          )}

          {step === 'covenant' && (
            <div>
              <Line className="font-display text-2xl font-bold tracking-wider">YOUR COVENANT BEGINS.</Line>
              <div className="mt-8 space-y-3 text-left text-sm text-ink2">
                <Line delay={0.5}>· Every task you complete grants XP. Every task you fail takes the same away.</Line>
                <Line delay={1.1}>· Unfinished tasks fail at midnight. The System does not forget.</Line>
                <Line delay={1.7}>· You can fall — levels and ranks can be lost.</Line>
                <Line delay={2.3}>· Report honestly. The only one you can cheat is yourself.</Line>
              </div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }}>
                <Button className="mt-10 w-full" onClick={finish} disabled={action.isPending}>I accept</Button>
              </motion.div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
