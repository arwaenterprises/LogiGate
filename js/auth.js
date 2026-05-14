// ============================================================================
// LogiGate Auth Module
// Handles Supabase authentication, session checking, and client access
// ============================================================================

// Supabase Client Configuration
const SUPABASE_URL = 'https://kyktwzwiraipwyglkhva.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5a3R3endpcmFpcHd5Z2xraHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTE2NDYxMzMsImV4cCI6MTg2OTQxNDEzM30.oPZGP3MWZc6kAU4_Kc8t-EX-gZST8h-B2Nt-AqcFPww';

// Initialize Supabase Client (Global)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// CHECK AUTHENTICATION
// ============================================================================

/**
 * Check if user is authenticated and return user object with client_id
 * @returns {Promise<Object|null>} User object or null if not authenticated
 */
async function checkAuth() {
    try {
        // Get current session from Supabase
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error || !session) {
            console.warn('No active session');
            return null;
        }

        const user = session.user;
        
        // Fetch user details from admin_users table (Arwa SaaS table)
        const { data: userData, error: userError } = await supabaseClient
            .from('admin_users')
            .select('id, username, name, role, client_id, status')
            .eq('id', user.id)
            .single();

        if (userError || !userData) {
            console.error('User not found in admin_users table:', userError);
            return null;
        }

        // Check if user is active
        if (userData.status !== 'active') {
            console.warn('User account is inactive');
            return null;
        }

        // Return user object with client_id
        return {
            id: userData.id,
            username: userData.username,
            name: userData.name,
            role: userData.role,
            client_id: userData.client_id,
            email: user.email,
            status: userData.status
        };

    } catch (error) {
        console.error('Auth check error:', error);
        return null;
    }
}

// ============================================================================
// CHECK LOGIGATE ACCESS
// ============================================================================

/**
 * Check if user's client has LogiGate enabled
 * @param {String} clientId - Client ID from user
 * @returns {Promise<Boolean>} True if client has LogiGate access
 */
async function checkLogigateAccess(clientId) {
    try {
        const { data, error } = await supabaseClient
            .from('clients')
            .select('subscribed_apps')
            .eq('id', clientId)
            .single();

        if (error || !data) {
            console.error('Client not found:', error);
            return false;
        }

        // Check if 'logigate' is in subscribed_apps array
        const subscribedApps = data.subscribed_apps || [];
        const hasLogigateAccess = subscribedApps.includes('logigate');

        console.log('Client apps:', subscribedApps, 'Has LogiGate:', hasLogigateAccess);
        return hasLogigateAccess;

    } catch (error) {
        console.error('Access check error:', error);
        return false;
    }
}

// ============================================================================
// LOGOUT
// ============================================================================

/**
 * Logout user and redirect to login page
 */
async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;

        // Redirect to Arwa Admin login
        window.location.href = '/admin/';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ============================================================================
// GET CURRENT USER
// ============================================================================

/**
 * Get current authenticated user (cached in session)
 * @returns {Promise<Object|null>} Current user object
 */
async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        return user || null;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// ============================================================================
// GET CLIENT INFO
// ============================================================================

/**
 * Fetch client/company information
 * @param {String} clientId - Client ID
 * @returns {Promise<Object|null>} Client object with company details
 */
async function getClientInfo(clientId) {
    try {
        const { data, error } = await supabaseClient
            .from('clients')
            .select('id, business_name, business_name_ar, logo_url, client_code, plan')
            .eq('id', clientId)
            .single();

        if (error || !data) {
            console.error('Client info fetch error:', error);
            return null;
        }

        return data;

    } catch (error) {
        console.error('Error fetching client:', error);
        return null;
    }
}

// ============================================================================
// VERIFY USER ROLE
// ============================================================================

/**
 * Check if user has specific role
 * @param {String} userRole - User's role
 * @param {Array<String>} allowedRoles - Allowed roles
 * @returns {Boolean} True if user has allowed role
 */
function hasRole(userRole, allowedRoles = []) {
    return allowedRoles.includes(userRole);
}

// ============================================================================
// REDIRECT TO LOGIN IF NOT AUTHENTICATED
// ============================================================================

/**
 * Redirect to admin login if user is not authenticated
 * Call this on app startup to protect pages
 */
async function requireAuth() {
    const user = await checkAuth();
    
    if (!user) {
        // Redirect to Arwa Admin login
        window.location.href = '/admin/';
        return false;
    }

    return user;
}

// ============================================================================
// REDIRECT TO LOGIN IF LOGIGATE NOT SUBSCRIBED
// ============================================================================

/**
 * Redirect to admin if client does not have LogiGate
 * Call this after checkAuth() to verify access
 */
async function requireLogigateAccess(clientId) {
    const hasAccess = await checkLogigateAccess(clientId);
    
    if (!hasAccess) {
        window.location.href = '/admin/';
        return false;
    }

    return true;
}

// ============================================================================
// INITIALIZE AUTH ON PAGE LOAD
// ============================================================================

/**
 * Run on app initialization to check auth and setup session
 * Returns user object if authenticated, null otherwise
 */
async function initializeAuth() {
    try {
        console.log('Initializing LogiGate auth...');

        // Check if session exists
        const user = await checkAuth();
        
        if (!user) {
            console.warn('User not authenticated');
            return null;
        }

        console.log('User authenticated:', user.name);

        // Check LogiGate access
        const hasAccess = await checkLogigateAccess(user.client_id);
        
        if (!hasAccess) {
            console.warn('User does not have LogiGate access');
            return null;
        }

        console.log('User has LogiGate access');
        return user;

    } catch (error) {
        console.error('Auth initialization error:', error);
        return null;
    }
}

// ============================================================================
// LISTEN FOR AUTH STATE CHANGES
// ============================================================================

/**
 * Setup listener for auth state changes
 * Automatically redirects on logout
 */
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        // Optionally redirect to login
        // window.location.href = '/admin/';
    } else if (event === 'SIGNED_IN') {
        console.log('User signed in');
    }
});

// ============================================================================
// EXPORT FUNCTIONS (for use in other modules)
// ============================================================================

// All functions are globally available
// No module.exports needed for vanilla JS
