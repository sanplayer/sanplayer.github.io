/**
 * AndroidLogger.js - Bridge para logs JavaScript no logcat do Android
 * Substitui console.error/log para que apareçam no logcat via Java
 */

window.AndroidLogger = {
    /**
     * Log via Java para aparecer no logcat
     */
    log: function(prefix, message, data) {
        try {
            // Se houver dados, incluir como JSON
            const fullMessage = data ? prefix + ' ' + message + ' ' + JSON.stringify(data) : prefix + ' ' + message;
            
            // Chamar MediaBridge que passa para Java
            if (window.MediaBridge && typeof window.MediaBridge.logDebug === 'function') {
                window.MediaBridge.logDebug(fullMessage);
            } else {
                // Fallback - pelo menos tenta console.error
                console.error(fullMessage);
            }
        } catch (e) {
            console.error('AndroidLogger error:', e);
        }
    }
};

// Override console.error para ir também para logcat
const originalError = console.error;
console.error = function(...args) {
    originalError.apply(console, args);
    // Enviar para logcat também
    try {
        const message = args.join(' ');
        if (window.MediaBridge && typeof window.MediaBridge.logDebug === 'function') {
            window.MediaBridge.logDebug('[JS_ERROR] ' + message);
        }
    } catch (e) {
        // Silencioso se falhar
    }
};
