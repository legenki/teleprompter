/**
 * TelePrompter v1.2.2 - Browser-based TelePrompter with Remote Control
 * (c) 2023 Peter Schmalfeldt
 * License: https://github.com/manifestinteractive/teleprompter/blob/master/LICENSE
 */
var TelePrompter = (function() {
  /**
   * ==================================================
   * TelePrompter App Settings
   * ==================================================
   */

  /* DOM Elements used by App */
  var $elm = {};

  /* App Settings */
  var emitTimeout,
    debug = false,
    initialized = false,
    isPlaying = false,
    remote,
    scrollDelay,
    socket,
    modalOpen = false,
    timeout,
    timer,
    timerExp = 10,
    timerGA,
    timerURL,
    version = 'v1.2.2';

  /* Default App Settings */
  var defaultConfig = {
    backgroundColor: '#141414',
    dimControls: true,
    flipX: false,
    flipY: false,
    fontSize: 60,
    pageSpeed: 35,
    pageScrollPercent: 0,
    textColor: '#ffffff'
  };

  /* Custom App Settings */
  var config = Object.assign({}, defaultConfig);

  /**
   * ==================================================
   * TelePrompter Init Functions
   * ==================================================
   */

  /**
   * Bind Events to DOM Elements
   */
  function bindEvents() {
    // Cache DOM Elements
    $elm.article = $('article');
    $elm.backgroundColor = $('#background-color');
    $elm.body = $('body');
    $elm.buttonDimControls = $('.button.dim-controls');
    $elm.buttonFlipX = $('.button.flip-x');
    $elm.buttonFlipY = $('.button.flip-y');
    $elm.buttonPlay = $('.button.play');
    $elm.buttonRemote = $('.button.remote');
    $elm.buttonReset = $('.button.reset');
    $elm.closeModal = $('.close-modal');
    $elm.fontSize = $('.font_size');
    $elm.gaInput = $('input[data-ga], textarea[data-ga], select[data-ga]');
    $elm.gaLinks = $('a[data-ga], button[data-ga]');
    $elm.header = $('header');
    $elm.headerContent = $('header h1, header nav');
    $elm.markerOverlay = $('.marker, .overlay');
    $elm.modal = $('#modal');
    $elm.remoteID = $('.remote-id');
    $elm.remoteURL = $('.remote-url');
    $elm.remoteControlModal = $('#remote-control-modal');
    $elm.speed = $('.speed');
    $elm.softwareUpdate = $('#software-update');
    $elm.teleprompter = $('#teleprompter');
    $elm.textColor = $('#text-color');
    $elm.window = $(window);

    // Bind Events
    $elm.backgroundColor.on('change.teleprompter', handleBackgroundColor);
    $elm.buttonDimControls.on('click.teleprompter', handleDim);
    $elm.buttonFlipX.on('click.teleprompter', handleFlipX);
    $elm.buttonFlipY.on('click.teleprompter', handleFlipY);
    $elm.buttonPlay.on('click.teleprompter', handlePlay);
    $elm.buttonRemote.on('click.teleprompter', handleRemote);
    $elm.buttonReset.on('click.teleprompter', handleReset);
    $elm.closeModal.on('click.teleprompter', handleCloseModal);
    $elm.gaInput.on('change.teleprompter', gaInput);
    $elm.gaLinks.on('click.teleprompter', gaLinks);
    $elm.textColor.on('change.teleprompter', handleTextColor);

    // Listen for Key Presses
    $elm.teleprompter.keyup(updateTeleprompter);
    $elm.body.keydown(navigate);
  }

  /**
   * Check for Software Update
   */
   function checkForUpdate() {
    var currentVersion = localStorage.getItem('teleprompter_version');
    var customText = localStorage.getItem('teleprompter_text');

    // Compare User Config to Default Config
    if (customText && currentVersion !== version) {
      // User had custom settings on page load
      localStorage.setItem('teleprompter_version', version);

      // Open Software Update Modal
      $elm.modal.css('display', 'flex');
      $elm.remoteControlModal.hide();
      $elm.softwareUpdate.show();

      modalOpen = true;

    } else if (currentVersion !== version) {
      localStorage.setItem('teleprompter_version', version);
    }
  }

  /**
   * Initialize TelePrompter App
   */
  function init() {
    // Exit if already started
    if (initialized) {
      return;
    }

    // Startup App
    bindEvents();
    initSettings();
    initUI();
    initRemote();
    checkForUpdate();
    syncPrompterToTheme();
    updateStats();
    bindExtraFeatures();

    // Track that we've started TelePrompter
    initialized = true;

    if (debug) {
      console.log('[TP]', 'TelePrompter Initialized');
    }
  }

  /**
   * Initialize Remote
   */
  function initRemote() {
    // Connect to Remote if Provided
    var currentRemote = localStorage.getItem('teleprompter_remote_id');
    if (currentRemote && currentRemote.length === 6) {
      // Wait a second for socket to load
      setTimeout(function(){
        remoteConnect(currentRemote);
      }, 1000);
    }

    if (debug) {
      console.log('[TP]', 'Remote Initialized', currentRemote ? '( Remote ID: ' + currentRemote + ' )' : '( No Remote )');
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){}, timerExp);
    gaEvent('TP', 'Remote Initialized', currentRemote ? currentRemote : 'No Remote');
  }

  /**
   * Initialize Settings ( Pull from URL First, then Local Storage )
   */
  function initSettings() {
    // Check if there are already URL Params
    var urlParams = getUrlVars();
    if (urlParams) {
      // Update Background Color if Present, otherwise Set to Default since Not Present
      if (urlParams.backgroundColor) {
        config.backgroundColor = decodeURIComponent(urlParams.backgroundColor);
        localStorage.setItem('teleprompter_background_color', config.backgroundColor);
      } else {
        config.backgroundColor = defaultConfig.backgroundColor;
        localStorage.removeItem('teleprompter_background_color');
      }

      // Update Dim Controls if Present, otherwise Set to Default since Not Present
      if (urlParams.dimControls) {
        config.dimControls = (decodeURIComponent(urlParams.dimControls) === 'true');
        localStorage.setItem('teleprompter_dim_controls', config.dimControls);
      } else {
        config.dimControls = defaultConfig.dimControls;
        localStorage.removeItem('teleprompter_dim_controls');
      }

      // Update Flip X if Present, otherwise Set to Default since Not Present
      if (urlParams.flipX) {
        config.flipX = (decodeURIComponent(urlParams.flipX) === 'true');
        localStorage.setItem('teleprompter_flip_x', config.flipX);
      } else {
        config.flipX = defaultConfig.flipX;
        localStorage.removeItem('teleprompter_flip_x');
      }

      // Update Flip Y if Present, otherwise Set to Default since Not Present
      if (urlParams.flipY) {
        config.flipY = (decodeURIComponent(urlParams.flipY) === 'true');
        localStorage.setItem('teleprompter_flip_y', config.flipY);
      } else {
        config.flipY = defaultConfig.flipY;
        localStorage.removeItem('teleprompter_flip_y');
      }

      // Update Font Size if Present, otherwise Set to Default since Not Present
      if (urlParams.fontSize) {
        config.fontSize = parseInt(decodeURIComponent(urlParams.fontSize));
        localStorage.setItem('teleprompter_font_size', config.fontSize);
      } else {
        config.fontSize = defaultConfig.fontSize;
        localStorage.removeItem('teleprompter_font_size');
      }

      // Update Page Speed if Present, otherwise Set to Default since Not Present
      if (urlParams.pageSpeed) {
        config.pageSpeed = parseInt(decodeURIComponent(urlParams.pageSpeed));
        localStorage.setItem('teleprompter_speed', config.pageSpeed);
      } else {
        config.pageSpeed = defaultConfig.pageSpeed;
        localStorage.removeItem('teleprompter_speed');
      }

      // Update Text Color if Present, otherwise Set to Default since Not Present
      if (urlParams.textColor) {
        config.textColor = decodeURIComponent(urlParams.textColor);
        localStorage.setItem('teleprompter_text_color', config.textColor);
      } else {
        config.textColor = defaultConfig.textColor;
        localStorage.removeItem('teleprompter_text_color');
      }
    }

    // Check if we've been here before and made changes
    if (localStorage.getItem('teleprompter_background_color')) {
      config.backgroundColor = localStorage.getItem('teleprompter_background_color');

      // Update UI with Custom Background Color
      $elm.backgroundColor.val(config.backgroundColor);
      $elm.article.css('background-color', config.backgroundColor);
      $elm.body.css('background-color', config.backgroundColor);
      $elm.teleprompter.css('background-color', config.backgroundColor);
    } else {
      cleanTeleprompter();
    }

    if (localStorage.getItem('teleprompter_dim_controls')) {
      config.dimControls = localStorage.getItem('teleprompter_dim_controls') === 'true';

      // Update Indicator
      if (config.dimControls) {
        $elm.buttonDimControls.removeClass('icon-eye-open').addClass('icon-eye-close');
      } else {
        $elm.buttonDimControls.removeClass('icon-eye-close').addClass('icon-eye-open');
      }
    }

    if (localStorage.getItem('teleprompter_flip_x')) {
      config.flipX = localStorage.getItem('teleprompter_flip_x') === 'true';

      // Update Indicator
      if (config.flipX) {
        $elm.buttonFlipX.addClass('active');
      }
    }

    if (localStorage.getItem('teleprompter_flip_y')) {
      config.flipY = localStorage.getItem('teleprompter_flip_y') === 'true';

      // Update Indicator
      if (config.flipY) {
        $elm.buttonFlipY.addClass('active');
      }
    }

    if (localStorage.getItem('teleprompter_font_size')) {
      config.fontSize = localStorage.getItem('teleprompter_font_size');
    }

    if (localStorage.getItem('teleprompter_speed')) {
      config.pageSpeed = localStorage.getItem('teleprompter_speed');
    }

    if (localStorage.getItem('teleprompter_text')) {
      $elm.teleprompter.html(localStorage.getItem('teleprompter_text'));
    }

    if (localStorage.getItem('teleprompter_text_color')) {
      config.textColor = localStorage.getItem('teleprompter_text_color');
      $elm.textColor.val(config.textColor);
      $elm.teleprompter.css('color', config.textColor);
    }

    if (debug) {
      console.log('[TP]', 'Settings Initialized', urlParams ? urlParams : '( No URL Params )');
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){}, timerExp);
    gaEvent('TP', 'Settings Initialized', urlParams ? 'Custom URL Params' : 'No URL Params');
  }

  /**
   * Initialize UI
   */
  function initUI() {
    // Create Timer
    timer = $('.clock').timer({
      stopVal: 10000,
      onChange: function(time) {
        if (socket && remote) {
          socket.emit('clientCommand', 'updateTime', time);
        }
      }
    });

    // Update Flip text if Present
    if (config.flipX && config.flipY) {
      $elm.teleprompter.addClass('flip-xy');
    } else if (config.flipX) {
      $elm.teleprompter.addClass('flip-x');
    } else if (config.flipY) {
      $elm.teleprompter.addClass('flip-y');
    }

    // Setup GUI
    $elm.article.stop().animate({
      scrollTop: 0
    }, 100, 'linear', function() {
      $elm.article.clearQueue();
    });

    // Set Overlay and TelePrompter Defaults
    $elm.markerOverlay.fadeOut(0);
    $elm.teleprompter.css({
      'padding-bottom': Math.ceil($elm.window.height() - $elm.header.height()) + 'px'
    });

    // Create Font Size Slider
    $elm.fontSize.slider({
      min: 12,
      max: 100,
      value: config.fontSize,
      orientation: 'horizontal',
      range: 'min',
      animate: true,
      slide: function() {
        updateFontSize(true);
      },
      change: function() {
        updateFontSize(true);
      }
    });

    // Create Speed Slider
    $elm.speed.slider({
      min: 0,
      max: 50,
      value: config.pageSpeed,
      orientation: 'horizontal',
      range: 'min',
      animate: true,
      slide: function() {
        updateSpeed(true);
      },
      change: function() {
        updateSpeed(true);
      }
    });

    // Run initial configuration on sliders
    if (config.fontSize !== defaultConfig.fontSize) {
      updateFontSize(false);
    }

    if (config.pageSpeed !== defaultConfig.pageSpeed) {
      updateSpeed(false);
    }

    // Clean up Empty Paragraph Tags
    $('p:empty', $elm.teleprompter).remove();

    // Update UI with Ready Class
    $elm.teleprompter.addClass('ready');

    if (debug) {
      console.log('[TP]', 'UI Initialized');
    }
  }

  /**
   * ==================================================
   * Core Functions
   * ==================================================
   */

  /**
   * Clean Teleprompter
   */
  function cleanTeleprompter() {
    var text = $elm.teleprompter.html();
    text = text.replace(/<br>+/g, '@@').replace(/@@@@/g, '</p><p>');
    text = text.replace(/@@/g, '<br>');
    text = text.replace(/([a-z])\. ([A-Z])/g, '$1.&nbsp;&nbsp; $2');
    text = text.replace(/<p><\/p>/g, '');

    if (text && text.substr(0, 3) !== '<p>') {
      text = '<p>' + text + '</p>';
    }

    $elm.teleprompter.html(text);
    $('p:empty', $elm.teleprompter).remove();
  }

  /**
   * Setup Events using Google Analytics
   * @param category
   * @param action
   * @param label
   * @param value
   */
   function gaEvent(category, action, label, value) {
    if (typeof gtag !== 'undefined') {
      gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value
      });
    }

    if (debug) {
      console.log('[GA]', category, action, label, value);
    }
  }

  /**
   * Setup Google Analytics on Links
   * @param event
   */
  function gaLinks(event){
    var data;

    if (typeof event.target !== 'undefined' && typeof event.target.dataset !== 'undefined' && typeof event.target.dataset.ga !== 'undefined') {
      data = event.target.dataset;
    } else if (typeof event.target !== 'undefined' && typeof event.target.parentNode !== 'undefined' && typeof event.target.parentNode.dataset !== 'undefined' && typeof event.target.parentNode.dataset.track !== 'undefined') {
      data = event.target.parentNode.dataset;
    }

    if (typeof data === 'object' && typeof data.category === 'string' && typeof data.action === 'string' && typeof data.label === 'string') {
      gaEvent(data.category, data.action, data.label, data.value);
    }
  }

  /**
   * Setup Google Analytics on Input
   * @param event
   */
  function gaInput(event){
    var data;

    if (typeof event.target !== 'undefined' && typeof event.target.dataset !== 'undefined' && typeof event.target.dataset.ga !== 'undefined') {
      data = event.target.dataset;
    } else if (typeof event.target !== 'undefined' && typeof event.target.parentNode !== 'undefined' && typeof event.target.parentNode.dataset !== 'undefined' && typeof event.target.parentNode.dataset.track !== 'undefined') {
      data = event.target.parentNode.dataset;
    }

    if (typeof data === 'object' && typeof data.category === 'string' && typeof data.action === 'string') {
      gaEvent(data.category, data.action, event.target.value, event.target.value.length);
    }
  }

  /**
   * Get App Config
   * @param {String} key
   * @returns Object
   */
  function getConfig(key) {
    return key ? config[key] : config;
  }

  /**
   * Get URL Params
   */
  function getUrlVars() {
    var paramCount = 0;
    var vars = {};

    window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
      paramCount++;
      vars[key] = value;
    });

    if (debug) {
      console.log('[TP]', 'URL Params:', paramCount > 0 ? vars : null);
    }

    return (paramCount > 0) ? vars : null;
  }

  /**
   * Handle Background Color
   */
  function handleBackgroundColor() {
    config.backgroundColor = $elm.backgroundColor.val();

    $elm.teleprompter.css('background-color', config.backgroundColor);
    $elm.article.css('background-color', config.backgroundColor);
    $elm.body.css('background-color', config.backgroundColor);
    localStorage.setItem('teleprompter_background_color', config.backgroundColor);

    if (socket && remote) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Background Color Changed:', config.backgroundColor);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){}, timerExp);
    gaEvent('TP', 'Background Color Changed', config.backgroundColor);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Handle Closing Modal
   */
  function handleCloseModal() {
    // Reset Focus on Remote Button if needed
    if ($elm.remoteControlModal.is(':visible')) {
      $elm.buttonRemote.focus();
    }

    $elm.modal.hide();
    $elm.remoteControlModal.hide();
    $elm.softwareUpdate.hide();

    modalOpen = false;
  }

  /**
   * Handle Dimming Layovers
   * @param {Object} evt
   * @param {Boolean} skipUpdate
   */
  function handleDim(evt, skipUpdate) {
    if (config.dimControls) {
      config.dimControls = false;
      $elm.buttonDimControls.removeClass('icon-eye-close').addClass('icon-eye-open');
      $elm.headerContent.fadeTo('slow', 1);
      $elm.markerOverlay.fadeOut('slow');
    } else {
      config.dimControls = true;
      $elm.buttonDimControls.removeClass('icon-eye-open').addClass('icon-eye-close');

      if (isPlaying) {
        $elm.headerContent.fadeTo('slow', 0.15);
        $elm.markerOverlay.fadeIn('slow');
      }
    }

    localStorage.setItem('teleprompter_dim_controls', config.dimControls);

    if (socket && remote && !skipUpdate) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Dim Control Changed:', config.dimControls);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Dim Control Changed', config.dimControls);
    }, timerExp);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
  }

  /**
   * Handle Flipping Text Horizontally
   * @param {Object} evt
   * @param {Boolean} skipUpdate
   */
  function handleFlipX(evt, skipUpdate) {
    timer.resetTimer();

    if (socket && remote) {
      socket.emit('clientCommand', 'updateTime', '00:00:00');
    }

    // Remove Flip Classes
    $elm.teleprompter.removeClass('flip-x').removeClass('flip-xy');

    if (config.flipX) {
      config.flipX = false;

      $elm.buttonFlipX.removeClass('active');
    } else {
      config.flipX = true;

      $elm.buttonFlipX.addClass('active');

      if (config.flipY) {
        $elm.teleprompter.addClass('flip-xy');
      } else {
        $elm.teleprompter.addClass('flip-x');
      }
    }

    localStorage.setItem('teleprompter_flip_x', config.flipX);

    if (socket && remote && !skipUpdate) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Flip X Changed:', config.flipX);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Flip X Changed', config.flipX);
    }, timerExp);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Handle Flipping Text Vertically
   * @param {Object} evt
   * @param {Boolean} skipUpdate
   */
  function handleFlipY(evt, skipUpdate) {
    timer.resetTimer();

    if (socket && remote) {
      socket.emit('clientCommand', 'updateTime', '00:00:00');
    }

    // Remove Flip Classes
    $elm.teleprompter.removeClass('flip-y').removeClass('flip-xy');

    if (config.flipY) {
      config.flipY = false;

      $elm.buttonFlipY.removeClass('active');
    } else {
      config.flipY = true;

      $elm.buttonFlipY.addClass('active');

      if (config.flipX) {
        $elm.teleprompter.addClass('flip-xy');
      } else {
        $elm.teleprompter.addClass('flip-y');
      }
    }

    localStorage.setItem('teleprompter_flip_y', config.flipY);

    if (config.flipY) {
      $elm.article.stop().animate({
        scrollTop: $elm.teleprompter.height() + 100
      }, 250, 'swing', function() {
        $elm.article.clearQueue();
      });
    } else {
      $elm.article.stop().animate({
        scrollTop: 0
      }, 250, 'swing', function() {
        $elm.article.clearQueue();
      });
    }

    if (socket && remote && !skipUpdate) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Flip Y Changed:', config.flipY);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Flip Y Changed', config.flipY);
    }, timerExp);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Handle Updating Text Color
   */
  function handleTextColor() {
    config.textColor = $elm.textColor.val();

    $elm.teleprompter.css('color', config.textColor);
    localStorage.setItem('teleprompter_text_color', config.textColor);

    if (socket && remote) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Text Color Changed:', config.textColor);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Text Color Changed', config.textColor);
    }, timerExp);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Handle Play Button Press
   */
  function handlePlay() {
    if (!isPlaying) {
      var countdownEnabled = false;
      try { countdownEnabled = localStorage.getItem('teleprompter_countdown') !== '0'; } catch (e) {}
      if (countdownEnabled) {
        runCountdown(startTeleprompter);
      } else {
        startTeleprompter();
      }
    } else {
      stopTeleprompter();
    }
  }

  /**
   * Handle Remote Button Press
   */
  function handleRemote() {
    if (!socket && !remote) {
      var currentRemote = localStorage.getItem('teleprompter_remote_id');
      remoteConnect(currentRemote);
    } else {
      $elm.modal.css('display', 'flex');
      $elm.remoteControlModal.show();
      $elm.softwareUpdate.hide();
    }

    $elm.buttonRemote.blur();
    modalOpen = true;

    if (debug) {
      console.log('[TP]', 'Remote Button Pressed');
    }
  }

  /**
   * Apply default GitHub-dark prompter colors on first run.
   * Re-running on each load ensures the prompter always matches the
   * dark UI; user can still override via the color pickers, the
   * choice persists in localStorage from initSettings().
   */
  function syncPrompterToTheme() {
    // Cleanup the obsolete theme key (light theme is gone)
    try { localStorage.removeItem('teleprompter_theme'); } catch (e) {}

    var hasUserBg = false;
    var hasUserText = false;
    var savedBg = '';
    var savedText = '';
    try {
      savedBg = localStorage.getItem('teleprompter_background_color') || '';
      savedText = localStorage.getItem('teleprompter_text_color') || '';
      hasUserBg = !!savedBg;
      hasUserText = !!savedText;
    } catch (e) {}

    var prompterBg = '#0d1117';
    var prompterText = '#f0f6fc';

    // Migrate from removed light-theme defaults
    if (savedBg.toLowerCase() === '#ffffff') hasUserBg = false;
    if (savedText.toLowerCase() === '#1f2328' || savedText.toLowerCase() === '#1a1916') hasUserText = false;

    if (hasUserBg && hasUserText) return;

    if (!hasUserBg) {
      config.backgroundColor = prompterBg;
      if ($elm.backgroundColor && $elm.backgroundColor.length) {
        $elm.backgroundColor.val(prompterBg);
      }
      if ($elm.article && $elm.article.length) {
        $elm.article.css('background-color', prompterBg);
      }
      if ($elm.teleprompter && $elm.teleprompter.length) {
        $elm.teleprompter.css('background-color', prompterBg);
      }
      try { localStorage.setItem('teleprompter_background_color', prompterBg); } catch (e) {}
    }

    if (!hasUserText) {
      config.textColor = prompterText;
      if ($elm.textColor && $elm.textColor.length) {
        $elm.textColor.val(prompterText);
      }
      if ($elm.teleprompter && $elm.teleprompter.length) {
        $elm.teleprompter.css('color', prompterText);
      }
      try { localStorage.setItem('teleprompter_text_color', prompterText); } catch (e) {}
    }
  }

  /**
   * Handle Reset Button Press
   */
  function handleReset() {
    stopTeleprompter();
    timer.resetTimer();

    config.pageScrollPercent = 0;

    $elm.article.stop().animate({
      scrollTop: 0
    }, 100, 'linear', function() {
      $elm.article.clearQueue();
    });

    if (socket && remote) {
      socket.emit('clientCommand', 'updateTime', '00:00:00');
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Reset Button Pressed');
    }
  }

  /**
   * Listen for Keyboard Navigation
   * @param {Object} evt
   * @returns Boolean
   */
  function navigate(evt) {
    var space = 32,
      escape = 27,
      left = 37,
      up = 38,
      right = 39,
      down = 40,
      page_up = 33,
      page_down = 34,
      b_key = 66,
      f5_key = 116,
      period_key = 190,
      tab = 9,
      speed = $elm.speed.slider('value'),
      font_size = $elm.fontSize.slider('value');

    // Allow text edit if we're inside an input field or tab key press
    if (evt.target.id === 'teleprompter' || evt.keyCode === tab) {
      return;
    }

    // Check if Escape Key and Modal Open
    if (evt.keyCode == escape && modalOpen) {
      if ($elm.remoteControlModal.is(':visible')) {
        $elm.buttonRemote.focus();
      }

      $elm.modal.hide();
      modalOpen = false;
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }

    // Skip if UI element or Modal Open
    if (modalOpen || evt.target.nodeName === 'INPUT' || evt.target.nodeName === 'BUTTON' || evt.target.nodeName === 'A' || evt.target.nodeName === 'SPAN') {
      return;
    }

    // Reset GUI
    if (evt.keyCode == escape) {
      $elm.buttonReset.trigger('click');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
    // Start Stop Scrolling
    else if (evt.keyCode == space || [b_key, f5_key, period_key].includes(evt.keyCode)) {
      $elm.buttonPlay.trigger('click');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
    // Decrease Speed
    else if (evt.keyCode == left || evt.keyCode == page_up) {
      $elm.speed.slider('value', speed - 1);
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
    // Decrease Font Size
    else if (evt.keyCode == down) {
      $elm.fontSize.slider('value', font_size - 1);
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
    // Increase Font Size
    else if (evt.keyCode == up) {
      $elm.fontSize.slider('value', font_size + 1);
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
    // Increase Speed
    else if (evt.keyCode == right || evt.keyCode == page_down) {
      $elm.speed.slider('value', speed + 1);
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
  }

  /**
   * Manage Scrolling Teleprompter
   */
  function pageScroll() {
    var offset = 1;
    var animate = 0;

    if (config.pageSpeed == 0) {
      $elm.article.stop().clearQueue();
      clearTimeout(scrollDelay);
      scrollDelay = setTimeout(pageScroll, 500);
      return;
    }

    clearTimeout(scrollDelay);
    scrollDelay = setTimeout(pageScroll, Math.floor(50 - config.pageSpeed));

    if ($elm.teleprompter.hasClass('flip-y')) {
      $elm.article.stop().animate({
        scrollTop: '-=' + offset + 'px'
      }, animate, 'linear', function() {
        $elm.article.clearQueue();
      });

      // We're at the bottom of the document, stop
      if ($elm.article.scrollTop() === 0) {
        stopTeleprompter();
        setTimeout(function() {
          $elm.article.stop().animate({
            scrollTop: $elm.teleprompter.height() + 100
          }, 500, 'swing', function() {
            $elm.article.clearQueue();
          });
        }, 500);
      }
    } else {
      $elm.article.stop().animate({
        scrollTop: '+=' + offset + 'px'
      }, animate, 'linear', function() {
        $elm.article.clearQueue();
      });

      // We're at the bottom of the document, stop
      if ($elm.article.scrollTop() >= (($elm.article[0].scrollHeight - $elm.window.height()) - 100)) {
        stopTeleprompter();
        setTimeout(function() {
          $elm.article.stop().animate({
            scrollTop: 0
          }, 500, 'swing', function() {
            $elm.article.clearQueue();
          });
        }, 500);
      }
    }

    // Update pageScrollPercent
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      $elm.win = $elm.article[0];
      var scrollHeight = $elm.win.scrollHeight;
      var scrollTop = $elm.win.scrollTop;
      var clientHeight = $elm.win.clientHeight;

      config.pageScrollPercent = Math.round(((scrollTop / (scrollHeight - clientHeight)) + Number.EPSILON) * 100);

      if (socket && remote) {
        clearTimeout(emitTimeout);
        emitTimeout = setTimeout(function(){
          socket.emit('clientCommand', 'updateConfig', config);
        }, timerExp);
      }
    }, animate);
  }

  /**
   * Create Random String for Remote
   * @returns string
   */
  function randomString() {
    var chars = '3456789ABCDEFGHJKLMNPQRSTUVWXY';
    var length = 6;
    var string = '';

    for (var i = 0; i < length; i++) {
      var num = Math.floor(Math.random() * chars.length);
      string += chars.substring(num, num + 1);
    }

    return string;
  }

  /**
   * Connect to Remote
   * @param {String} currentRemote Current Remote ID
   */
  function remoteConnect(currentRemote) {
    if (typeof io === 'undefined') {
      $elm.buttonRemote.removeClass('active');
      localStorage.removeItem('teleprompter_remote_id');
      return;
    }

    // Use current protocol for socket connection (http or https)
    var protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    var port = window.location.port ? ':' + window.location.port : '';
    var socketUrl = protocol + '//' + window.location.hostname + port;

    socket = io.connect(socketUrl, {
      path: '/socket.io'
    });

    remote = (currentRemote) ? currentRemote : randomString();

    socket.on('connect', function() {
      var $code = document.getElementById('qr-code');
      $code.innerHTML = '';
      socket.emit('connectToRemote', 'REMOTE_' + remote);

      $elm.remoteURL.text(protocol + '//' + window.location.hostname + port + '/remote');

      var url = protocol + '//' + window.location.hostname + port + '/remote?id=' + remote;

      new QRCode($code, url);
      $elm.remoteID.text(remote);

      if (!currentRemote) {
        $elm.modal.css('display', 'flex');
      }

      if (debug) {
        console.log('[IO]', 'Socket Connected');
      }

      clearTimeout(timerGA);
      timerGA = setTimeout(function(){
        gaEvent('IO', 'Socket Connected');
      }, timerExp);
    });

    socket.on('disconnect', function() {
      $elm.buttonRemote.removeClass('active');
      localStorage.removeItem('teleprompter_remote_id');

      if (debug) {
        console.log('[IO]', 'Socket Disconnected');
      }

      clearTimeout(timerGA);
      timerGA = setTimeout(function(){
        gaEvent('IO', 'Socket Disconnected');
      }, timerExp);
    });

    socket.on('connectedToRemote', function() {
      localStorage.setItem('teleprompter_remote_id', remote);
      $elm.buttonRemote.addClass('active');

      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);

      if (debug) {
        console.log('[IO]', 'Remote Connected:', remote);
      }

      clearTimeout(timerGA);
      timerGA = setTimeout(function(){
        gaEvent('IO', 'Remote Connected', remote);
      }, timerExp);
    });

    socket.on('remoteControl', function(command, value) {
      if (debug) {
        console.log('[TP]', 'remoteControl', command, value);
      }

      clearTimeout(timerGA);
      timerGA = setTimeout(function(){
        gaEvent('IO', 'Remote Control', command);
      }, timerExp);

      switch (command) {
        case 'reset':
          handleReset();
          break;

        case 'power':
          remoteDisconnect();
          break;

        case 'play':
          $elm.buttonPlay.trigger('click');
          break;

        case 'hideModal':
          $elm.modal.hide();
          break;

        case 'getConfig':
          if (socket && remote) {
            clearTimeout(emitTimeout);
            emitTimeout = setTimeout(function(){
              socket.emit('clientCommand', 'updateConfig', config);
            }, timerExp);
          }
          break;

        case 'updateConfig':
          clearTimeout(emitTimeout);
          remoteUpdate(config, value);
          break;
      }
    });
  }

  /**
   * Disconnect from Remote
   */
  function remoteDisconnect() {
    if (socket && remote) {
      socket.disconnect();
      remote = null;
    }

    if (debug) {
      console.log('[IO]', 'Remote Disconnected');
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('IO', 'Remote Disconnected');
    }, timerExp);
  }

  /**
   * Handle Updates from Remote
   * @param {Object} oldConfig
   * @param {Object} newConfig
   */
  function remoteUpdate(oldConfig, newConfig) {
    if (debug) {
      console.log('[IO]', 'Remote Update');
      console.log('[IO]', 'Old Config:', oldConfig);
      console.log('[IO]', 'New Config:', newConfig);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('IO', 'Remote Update');
    }, timerExp);

    if (oldConfig.dimControls !== newConfig.dimControls) {
      handleDim(null, true);
    }

    if (oldConfig.flipX !== newConfig.flipX) {
      handleFlipX(null, true);
    }

    if (oldConfig.flipY !== newConfig.flipY) {
      handleFlipY(null, true);
    }

    if (oldConfig.fontSize !== newConfig.fontSize) {
      $elm.fontSize.slider('value', newConfig.fontSize);
      updateFontSize(true, true);
    }

    if (oldConfig.pageSpeed !== newConfig.pageSpeed) {
      $elm.speed.slider('value', newConfig.pageSpeed);
      updateSpeed(true, true);
    }

    if (oldConfig.pageScrollPercent !== newConfig.pageScrollPercent) {
      config.pageScrollPercent = newConfig.pageScrollPercent;

      stopTeleprompter();

      $elm.win = $elm.article[0];
      var scrollHeight = $elm.win.scrollHeight;
      var clientHeight = $elm.win.clientHeight;

      var maxScrollStop = (scrollHeight - clientHeight);
      var percent = parseInt(config.pageScrollPercent) / 100;
      var newScrollTop = maxScrollStop * percent

      $elm.article.stop().animate({
        scrollTop: newScrollTop + 'px'
      }, 0, 'linear', function() {
        $elm.article.clearQueue();
      });
    }

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Start Teleprompter
   */
  function startTeleprompter() {
    // Check if Already Playing
    if (isPlaying) {
      return;
    }

    if (socket && remote) {
      socket.emit('clientCommand', 'play');
    }

    $elm.teleprompter.attr('contenteditable', false);
    $elm.body.addClass('playing');
    $elm.buttonPlay.removeClass('icon-play').addClass('icon-pause');

    if (config.dimControls) {
      $elm.headerContent.fadeTo('slow', 0.15);
      $elm.markerOverlay.fadeIn('slow');
    }

    timer.startTimer();

    pageScroll();

    isPlaying = true;

    if (debug) {
      console.log('[TP]', 'Starting TelePrompter');
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Starting TelePrompter');
    }, timerExp);
  }

  /**
   * Stop Teleprompter
   */
  function stopTeleprompter() {
    // Check if Already Stopped
    if (!isPlaying) {
      return;
    }

    if (socket && remote) {
      socket.emit('clientCommand', 'stop');
    }

    clearTimeout(scrollDelay);
    $elm.teleprompter.attr('contenteditable', true);

    if (config.dimControls) {
      $elm.headerContent.fadeTo('slow', 1);
      $elm.markerOverlay.fadeOut('slow');
    }

    $elm.buttonPlay.removeClass('icon-pause').addClass('icon-play');
    $elm.body.removeClass('playing');

    timer.stopTimer();

    isPlaying = false;

    if (debug) {
      console.log('[TP]', 'Stopping TelePrompter');
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Stopping TelePrompter');
    }, timerExp);
  }

  /**
   * Manage Font Size Change
   * @param {Boolean} save
   * @param {Boolean} skipUpdate
   */
  function updateFontSize(save, skipUpdate) {
    config.fontSize = $elm.fontSize.slider('value');

    $elm.teleprompter.css({
      'font-size': config.fontSize + 'px',
      'line-height': Math.ceil(config.fontSize * 1.5) + 'px',
      'padding-bottom': Math.ceil($elm.window.height() - $elm.header.height()) + 'px'
    });

    $('p', $elm.teleprompter).css({
      'padding-bottom': Math.ceil(config.fontSize * 0.25) + 'px',
      'margin-bottom': Math.ceil(config.fontSize * 0.25) + 'px'
    });

    $('label.font_size_label > span').text(config.fontSize);

    if (save) {
      localStorage.setItem('teleprompter_font_size', config.fontSize);
    }

    if (socket && remote && !skipUpdate) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Font Size Changed:', config.fontSize);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Font Size Changed', config.fontSize);
    }, timerExp);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Manage Speed Change
   * @param {Boolean} save
   * @param {Boolean} skipUpdate
   */
  function updateSpeed(save, skipUpdate) {
    config.pageSpeed = $elm.speed.slider('value');
    $('label.speed_label > span').text($elm.speed.slider('value'));
    updateStats();

    if (save) {
      localStorage.setItem('teleprompter_speed', $elm.speed.slider('value'));
    }

    if (socket && remote && !skipUpdate) {
      clearTimeout(emitTimeout);
      emitTimeout = setTimeout(function(){
        socket.emit('clientCommand', 'updateConfig', config);
      }, timerExp);
    }

    if (debug) {
      console.log('[TP]', 'Page Speed Changed:', config.pageSpeed);
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'Page Speed Changed', config.pageSpeed);
    }, timerExp);

    // Update URL Params
    clearTimeout(timerURL);
    timerURL = setTimeout(updateURL, timerExp);
    updateURL();
  }

  /**
   * Update Teleprompter Text
   * @param {Object} evt
   * @returns Boolean
   */
  function updateTeleprompter(evt) {
    if (evt.keyCode == 27) {
      $elm.teleprompter.blur();
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }

    localStorage.setItem('teleprompter_text', $elm.teleprompter.html());
    $('p:empty', $elm.teleprompter).remove();
    updateStats();

    if (debug) {
      console.log('[TP]', 'TelePrompter Text Updated');
    }

    clearTimeout(timerGA);
    timerGA = setTimeout(function(){
      gaEvent('TP', 'TelePrompter Text Updated');
    }, timerExp);
  }

  /**
   * Count words in current teleprompter text and estimate reading time.
   * Reading time is derived from pageSpeed (rough approximation:
   * speed 0..50 maps to ~80..220 words per minute).
   */
  function updateStats() {
    var text = ($elm.teleprompter.text() || '').trim();
    var words = text ? text.split(/\s+/).filter(Boolean).length : 0;

    // Map pageSpeed (0-50) to wpm (80-220)
    var speed = parseInt(config.pageSpeed, 10) || 0;
    var wpm = 80 + (speed / 50) * 140;
    var seconds = words > 0 ? Math.round((words / wpm) * 60) : 0;
    var mm = Math.floor(seconds / 60);
    var ss = seconds % 60;
    var formatted = '~' + mm + ':' + (ss < 10 ? '0' : '') + ss;

    var $w = document.getElementById('word-count');
    var $t = document.getElementById('reading-time');
    if ($w) $w.textContent = words;
    if ($t) $t.textContent = formatted;
  }

  /**
   * Push Config Params into URL for Sharable Configuration
   */
  function updateURL() {
    // Skip URL updates if running from file:// protocol (local development without server)
    if (window.location.protocol === 'file:') {
      return;
    }

    try {
      var custom = Object.assign({}, config);
      var keys = Object.keys(custom);

      keys.forEach(function(key) {
        // Remove Default Settings from URL
        if (custom[key] === defaultConfig[key]) {
          delete custom[key];
        }
      });

      if (Object.keys(custom).length > 0) {
        var urlParams = new URLSearchParams(custom);
        window.history.pushState(custom, 'TelePrompter', '/?' + urlParams);
      } else {
        window.history.pushState(null, 'TelePrompter', '/');
      }

      if (debug) {
        console.log('[TP]', 'URL Updated:', custom);
      }
    } catch (error) {
      console.warn('Failed to update URL:', error);
    }
  }

  /**
   * ==================================================
   * Extra UI Features: Drafts / Countdown / Marker
   * ==================================================
   */

  /* ---------- DRAFTS (saved scripts) ---------- */
  var DRAFTS_KEY = 'teleprompter_drafts';
  var ACTIVE_DRAFT_KEY = 'teleprompter_active_draft';

  function loadDrafts() {
    try {
      var raw = localStorage.getItem(DRAFTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveDrafts(drafts) {
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch (e) {}
  }
  function getActiveDraftId() {
    try { return localStorage.getItem(ACTIVE_DRAFT_KEY); } catch (e) { return null; }
  }
  function setActiveDraftId(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_DRAFT_KEY, id);
      else localStorage.removeItem(ACTIVE_DRAFT_KEY);
    } catch (e) {}
  }
  function renderDrafts() {
    var drafts = loadDrafts();
    var $list = document.getElementById('drafts-list');
    var $empty = document.getElementById('drafts-empty');
    if (!$list || !$empty) return;
    $list.innerHTML = '';
    if (!drafts.length) {
      $empty.classList.remove('hidden');
      return;
    }
    $empty.classList.add('hidden');
    var activeId = getActiveDraftId();
    drafts.forEach(function(d) {
      var li = document.createElement('li');
      if (d.id === activeId) li.classList.add('active');
      li.dataset.id = d.id;
      var preview = (d.text || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 60);
      var date = new Date(d.updated || d.created || Date.now()).toLocaleString();
      li.innerHTML = '<div class="draft-info">' +
        '<div class="draft-name"></div>' +
        '<div class="draft-meta"></div>' +
        '</div>' +
        '<button class="draft-delete" aria-label="Delete">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>' +
        '</button>';
      li.querySelector('.draft-name').textContent = d.name || preview || 'Untitled';
      li.querySelector('.draft-meta').textContent = date;
      li.addEventListener('click', function(e) {
        if (e.target.closest('.draft-delete')) return;
        loadDraftIntoEditor(d.id);
      });
      li.querySelector('.draft-delete').addEventListener('click', function(e) {
        e.stopPropagation();
        deleteDraft(d.id);
      });
      $list.appendChild(li);
    });
  }
  function saveCurrentAsDraft() {
    var name = prompt('Name this script:', '');
    if (name === null) return; // cancelled
    var drafts = loadDrafts();
    var id = 'd_' + Date.now();
    drafts.unshift({
      id: id,
      name: (name || '').trim() || 'Untitled',
      text: $elm.teleprompter.html(),
      created: Date.now(),
      updated: Date.now()
    });
    saveDrafts(drafts);
    setActiveDraftId(id);
    renderDrafts();
  }
  function loadDraftIntoEditor(id) {
    var drafts = loadDrafts();
    var d = drafts.find(function(x){ return x.id === id; });
    if (!d) return;
    $elm.teleprompter.html(d.text || '');
    localStorage.setItem('teleprompter_text', d.text || '');
    setActiveDraftId(id);
    renderDrafts();
    updateStats();
    closeDraftsPanel();
  }
  function deleteDraft(id) {
    if (!confirm('Delete this script?')) return;
    var drafts = loadDrafts().filter(function(d){ return d.id !== id; });
    saveDrafts(drafts);
    if (getActiveDraftId() === id) setActiveDraftId(null);
    renderDrafts();
  }
  function newDraft() {
    if ($elm.teleprompter.text().trim() &&
        !confirm('Discard current text and start a new script?')) return;
    $elm.teleprompter.html('<p>Type your new script here...</p>');
    localStorage.setItem('teleprompter_text', $elm.teleprompter.html());
    setActiveDraftId(null);
    renderDrafts();
    updateStats();
    closeDraftsPanel();
    $elm.teleprompter.focus();
  }
  function openDraftsPanel() {
    var $p = document.getElementById('drafts-panel');
    var $b = document.getElementById('drafts-backdrop');
    if ($p) { $p.classList.add('open'); $p.setAttribute('aria-hidden', 'false'); }
    if ($b) $b.hidden = false;
    renderDrafts();
  }
  function closeDraftsPanel() {
    var $p = document.getElementById('drafts-panel');
    var $b = document.getElementById('drafts-backdrop');
    if ($p) { $p.classList.remove('open'); $p.setAttribute('aria-hidden', 'true'); }
    if ($b) $b.hidden = true;
  }

  /* ---------- COUNTDOWN ---------- */
  function runCountdown(onDone) {
    var $cd = document.getElementById('countdown');
    var $num = $cd && $cd.querySelector('.countdown-num');
    if (!$cd || !$num) { onDone(); return; }
    $cd.hidden = false;
    var n = 3;
    function tick() {
      $num.textContent = n;
      // Restart animation
      $num.style.animation = 'none';
      $num.offsetHeight; // reflow
      $num.style.animation = '';
      if (n === 0) {
        setTimeout(function(){ $cd.hidden = true; onDone(); }, 800);
      } else {
        n--;
        setTimeout(tick, 1000);
      }
    }
    tick();
  }

  /* ---------- READING MARKER ---------- */
  function toggleMarker() {
    var $m = document.getElementById('reading-marker');
    if (!$m) return;
    var on = $m.hidden;
    $m.hidden = !on;
    try { localStorage.setItem('teleprompter_marker', on ? '1' : '0'); } catch (e) {}
  }
  function loadMarkerPref() {
    try {
      var v = localStorage.getItem('teleprompter_marker');
      var $m = document.getElementById('reading-marker');
      if ($m && v === '1') $m.hidden = false;
    } catch (e) {}
  }

  /* ---------- BIND EXTRA EVENTS ---------- */
  function bindExtraFeatures() {
    var $draftsBtn = document.getElementById('drafts-toggle');
    var $draftsClose = document.getElementById('drafts-close');
    var $draftsBackdrop = document.getElementById('drafts-backdrop');
    var $draftSave = document.getElementById('draft-save');
    var $draftNew = document.getElementById('draft-new');
    var $markerBtn = document.getElementById('marker-toggle');

    if ($draftsBtn) $draftsBtn.addEventListener('click', openDraftsPanel);
    if ($draftsClose) $draftsClose.addEventListener('click', closeDraftsPanel);
    if ($draftsBackdrop) $draftsBackdrop.addEventListener('click', closeDraftsPanel);
    if ($draftSave) $draftSave.addEventListener('click', saveCurrentAsDraft);
    if ($draftNew) $draftNew.addEventListener('click', newDraft);
    if ($markerBtn) $markerBtn.addEventListener('click', toggleMarker);

    loadMarkerPref();
    renderDrafts();
  }

  /* Expose Select Control to Public TelePrompter Object */
  return {
    version: version,
    init: init,
    getConfig: getConfig,
    start: startTeleprompter,
    stop: stopTeleprompter,
    reset: handleReset,
    setDebug: function(bool) {
      debug = !!bool;
      return this;
    },
    setSpeed: function(speed) {
      speed = Math.min(50, Math.max(0, speed));
      $elm.speed.slider('value', parseInt(speed));
      return this;
    },
    setFontSize: function(size) {
      size = Math.min(100, Math.max(12, size));
      $elm.fontSize.slider('value', parseInt(size));
      return this;
    },
    setDim: function(bool) {
      config.dimControls = !bool;
      handleDim();
      return this;
    },
    setFlipX: function(bool) {
      config.flipX = !bool;
      handleFlipX();
      return this;
    },
    setFlipY: function(bool) {
      config.flipY = !bool;
      handleFlipY();
      return this;
    }
  }
})();
