import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Dimensions, Animated, Image } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { Zap, MapPin, Battery, Navigation, Lock, Mail, User, Eye, EyeOff, ArrowRight } from 'lucide-react-native';
import { storage } from '@/utils/storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, register, isLoggingIn, isRegistering, isAuthenticated } = useAuth();
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const handleAuth = async () => {
      if (isAuthenticated === true) {
        const hasVehicle = await storage.hasSelectedVehicle();
        if (hasVehicle) {
          router.replace('/(tabs)/routes');
        } else {
          router.replace('/vehicle/select');
        }
      }
    };
    handleAuth();
  }, [isAuthenticated]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setError('');
  };

  const handleSubmit = async () => {
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      if (isLogin) {
        await login({ email, password });
      } else {
        if (!name) {
          setError('Please enter your name');
          return;
        }
        await register({ email, password, name });
      }
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed');
    }
  };

  const handleSwitchMode = () => {
    setIsLogin(!isLogin);
    resetForm();
  };

  if (isAuthenticated === null || isAuthenticated === true) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#0f172a', '#1e293b', '#334155']}
          style={StyleSheet.absoluteFillObject}
        />
        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
          <View style={styles.loadingLogoContainer}>
            <LinearGradient
              colors={['#3b82f6', '#2563eb']}
              style={styles.loadingLogoBg}
            >
              <Image
                source={require('../assets/images/icon.png')}
                style={{ width: 56, height: 56, resizeMode: 'contain' }}
              />
            </LinearGradient>
          </View>
          <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 20 }} />
          <Text style={styles.loadingText}>
            {isAuthenticated === true ? 'Welcome back!' : 'Loading...'}
          </Text>
        </Animated.View>
      </View>
    );
  }

  const isLoading = isLoggingIn || isRegistering;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#334155']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Decorative Background Blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Section */}
        <Animated.View
          style={[
            styles.heroSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <LinearGradient
            colors={['#3b82f6', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoContainer}
          >
            <Image
              source={require('../assets/images/icon.png')}
              style={{ width: 64, height: 64, resizeMode: 'contain' }}
            />
          </LinearGradient>

          <Text style={styles.appTitle}>EV Route Planner</Text>
          <Text style={styles.tagline}>Smart charging stops for your journey</Text>

          {/* Feature Pills */}
          <View style={styles.featurePills}>
            <View style={styles.featurePill}>
              <Zap size={14} color="#fbbf24" strokeWidth={2.5} />
              <Text style={styles.featurePillText}>Smart Routes</Text>
            </View>
            <View style={styles.featurePill}>
              <Battery size={14} color="#10b981" strokeWidth={2.5} />
              <Text style={styles.featurePillText}>Battery Tracking</Text>
            </View>
            <View style={styles.featurePill}>
              <MapPin size={14} color="#ef4444" strokeWidth={2.5} />
              <Text style={styles.featurePillText}>Live Traffic</Text>
            </View>
          </View>
        </Animated.View>

        {/* Glass Auth Card */}
        <Animated.View
          style={[
            styles.authCard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >

          {/* Glassmorphism effect */}
          <View style={styles.glassCard}>
            {/* <Text>Hola</Text> */}
            {/* Tab Switcher */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, isLogin && styles.tabActive]}
                onPress={() => setIsLogin(true)}
                disabled={isLoading}
              >
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, !isLogin && styles.tabActive]}
                onPress={() => setIsLogin(false)}
                disabled={isLoading}
              >
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              {!isLogin && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputWrapper}>
                    <User size={20} color="#94a3b8" strokeWidth={2} />
                    <TextInput
                      style={styles.input}
                      placeholder="John Doe"
                      placeholderTextColor="#64748b"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      editable={!isLoading}
                    />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={styles.inputWrapper}>
                  <Mail size={20} color="#94a3b8" strokeWidth={2} />
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#64748b"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Lock size={20} color="#94a3b8" strokeWidth={2} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#64748b"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <EyeOff size={20} color="#94a3b8" strokeWidth={2} />
                    ) : (
                      <Eye size={20} color="#94a3b8" strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={['#3b82f6', '#2563eb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>
                        {isLogin ? 'Sign In' : 'Create Account'}
                      </Text>
                      <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={handleSwitchMode}
                disabled={isLoading}
              >
                <Text style={styles.switchText}>
                  {isLogin
                    ? "Don't have an account? "
                    : 'Already have an account? '
                  }
                  <Text style={styles.switchTextBold}>
                    {isLogin ? 'Sign up' : 'Sign in'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <LinearGradient
                colors={['#3b82f6', '#2563eb']}
                style={styles.featureIconGradient}
              >
                <Navigation size={24} color="#fff" strokeWidth={2} />
              </LinearGradient>
            </View>
            <Text style={styles.featureTitle}>Optimized Routes</Text>
            <Text style={styles.featureDescription}>
              AI-powered routing considers battery, traffic, and charging stations
            </Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <LinearGradient
                colors={['#10b981', '#059669']}
                style={styles.featureIconGradient}
              >
                <Zap size={24} color="#fff" strokeWidth={2} />
              </LinearGradient>
            </View>
            <Text style={styles.featureTitle}>Smart Charging</Text>
            <Text style={styles.featureDescription}>
              Find the best charging stops along your journey
            </Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <LinearGradient
                colors={['#f59e0b', '#d97706']}
                style={styles.featureIconGradient}
              >
                <Battery size={24} color="#fff" strokeWidth={2} />
              </LinearGradient>
            </View>
            <Text style={styles.featureTitle}>Battery Monitor</Text>
            <Text style={styles.featureDescription}>
              Real-time battery tracking and range estimation
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>© 2025 EV Route Planner. All rights reserved.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogoContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // loadingLogoContainer: {
  //   marginBottom: 20,
  // },
  loadingLogoBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  loadingText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  blob1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#3b82f6',
    opacity: 0.1,
  },
  blob2: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#2563eb',
    opacity: 0.08,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '500',
    marginBottom: 20,
  },
  featurePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  featurePillText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  authCard: {
    marginBottom: 32,
  },
  glassCard: {
    // softened glass background so the padded form area doesn't appear as a bright patch
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // reduced from 0.08
    borderRadius: 20, // slightly reduced for a tighter look
    padding: 16, // reduced from 24 to make the card more compact
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)', // subtler edge
    // slightly reduced shadow to match smaller card
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20, // slightly tightened
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 8, // reduced from 10
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#fff',
  },
  form: {
    gap: 12, // reduced spacing between form groups
  },
  inputGroup: {
    marginBottom: 0,
    paddingBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // reduced spacing between icon and input
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 10, // reduced from 12 for a tighter feel
    paddingHorizontal: 12, // reduced from 16
    paddingVertical: 8, // reduced from 12
  },
  input: {
    flex: 1,
    fontSize: 14, // slightly smaller font
    color: '#fff',
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6, // reduced shadow radius for compact feel
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8, // reduced gap between text and icon
    paddingVertical: 12, // reduced from 16
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15, // reduced from 16
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  switchButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  switchText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  switchTextBold: {
    color: '#60a5fa',
    fontWeight: '700',
  },
  featuresSection: {
    gap: 16,
    marginBottom: 32,
  },
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureIconContainer: {
    marginBottom: 12,
  },
  featureIconGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
});