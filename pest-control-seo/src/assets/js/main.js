/**
 * Guardian Pest Control - Main JavaScript
 * Handles mobile menu, weather widget, and dynamic content
 */

(function() {
  'use strict';

  // Mobile Menu Toggle
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const desktopNav = document.querySelector('.desktop-nav');

  if (mobileMenuBtn && desktopNav) {
    mobileMenuBtn.addEventListener('click', () => {
      const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
      desktopNav.classList.toggle('mobile-open');
      
      // Animate hamburger
      const lines = mobileMenuBtn.querySelectorAll('.hamburger-line');
      if (!isExpanded) {
        lines[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        lines[1].style.opacity = '0';
        lines[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        lines[0].style.transform = '';
        lines[1].style.opacity = '';
        lines[2].style.transform = '';
      }
    });
  }

  // Weather Widget (Dynamic Local Data)
  async function initWeatherWidget() {
    const weatherContainer = document.getElementById('weather-widget');
    if (!weatherContainer) return;

    const lat = weatherContainer.dataset.lat;
    const lng = weatherContainer.dataset.lng;

    if (!lat || !lng) return;

    try {
      // Using Open-Meteo free API (no key required)
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m&timezone=auto`
      );
      
      if (!response.ok) throw new Error('Weather data unavailable');
      
      const data = await response.json();
      const current = data.current_weather;
      
      weatherContainer.innerHTML = `
        <div class="weather-display">
          <span class="weather-temp">${Math.round(current.temperature)}°F</span>
          <span class="weather-condition">
            ${getWeatherIcon(current.weathercode)}
            ${getWeatherDescription(current.weathercode)}
          </span>
          <span class="weather-wind">Wind: ${current.windspeed} mph</span>
        </div>
      `;
    } catch (error) {
      console.log('Weather widget: Using fallback data');
      weatherContainer.innerHTML = '<span class="weather-unavailable">Weather data temporarily unavailable</span>';
    }
  }

  function getWeatherIcon(code) {
    const icons = {
      0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
      45: '🌫️', 48: '🌫️',
      51: '🌦️', 53: '🌦️', 55: '🌦️',
      61: '🌧️', 63: '🌧️', 65: '🌧️',
      71: '🌨️', 73: '🌨️', 75: '🌨️',
      95: '⛈️', 96: '⛈️', 99: '⛈️'
    };
    return icons[code] || '🌡️';
  }

  function getWeatherDescription(code) {
    const descriptions = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
    };
    return descriptions[code] || 'Unknown';
  }

  // Local Time Display
  function updateLocalTime() {
    const timeElements = document.querySelectorAll('.local-time');
    if (!timeElements.length) return;

    const updateTime = () => {
      const now = new Date();
      const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      
      timeElements.forEach(el => {
        const timezone = el.dataset.timezone || 'America/New_York';
        try {
          el.textContent = now.toLocaleTimeString('en-US', { ...options, timeZone: timezone });
        } catch (e) {
          el.textContent = now.toLocaleString('en-US', options);
        }
      });
    };

    updateTime();
    setInterval(updateTime, 60000); // Update every minute
  }

  // Smooth scroll for anchor links
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // Form validation enhancement
  function initFormValidation() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        const inputs = form.querySelectorAll('[required]');
        let isValid = true;
        
        inputs.forEach(input => {
          if (!input.value.trim()) {
            isValid = false;
            input.classList.add('error');
          } else {
            input.classList.remove('error');
          }
        });
        
        if (!isValid) {
          e.preventDefault();
        }
      });
    });
  }

  // Lazy load images with Intersection Observer
  function initLazyLoad() {
    if ('loading' in HTMLImageElement.prototype) {
      // Browser supports native lazy loading
      return;
    }

    const images = document.querySelectorAll('img[loading="lazy"]');
    
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          img.classList.add('loaded');
          imageObserver.unobserve(img);
        }
      });
    });

    images.forEach(img => imageObserver.observe(img));
  }

  // Initialize all modules
  document.addEventListener('DOMContentLoaded', () => {
    initWeatherWidget();
    updateLocalTime();
    initSmoothScroll();
    initFormValidation();
    initLazyLoad();
  });

})();
