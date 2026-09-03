import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Set when Firebase itself failed to initialize (bad/missing VITE_FIREBASE_* env). */
  initError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      });
      return unsubscribe;
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Firebase failed to initialize.');
      setLoading(false);
      return undefined;
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    initError,
    signInWithGoogle: async () => {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    },
    signInWithEmail: async (email, password) => {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    },
    signUpWithEmail: async (email, password) => {
      await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    },
    signOutUser: async () => {
      await signOut(getFirebaseAuth());
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
