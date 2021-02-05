// ==UserScript==
// @name         Dynasty Loading Progress
// @namespace    github.com/luejerry
// @version      0.2.3
// @description  Adds a progress bar to page loading indicators on Dynasty.
// @author       cyricc
// @include      https://dynasty-scans.com/chapters/*
// @grant        none
// @downloadURL https://github.com/luejerry/dynasty-loadingprogress/raw/master/dynastyloadingprogress.user.js
// @updateURL   https://github.com/luejerry/dynasty-loadingprogress/raw/master/dynastyloadingprogress.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Incrementing counter that is used by loading listeners to hold exclusive access to the loading
  // bar. More recently created listeners immediately take the mutex, dropping the previous
  // listener even if it has not completed
  let switchMutex = 0;

  // Task scheduler that throttles updates to the animation framerate
  const animator = createAnimationDispatcher();

  // Add loading bar to Dynasty's native loading indicator
  const divLoading = document.getElementById('loading');
  const divLoadingProgress = document.createElement('div');
  Object.assign(divLoadingProgress.style, {
    height: '2px',
    background: 'white',
    width: '0%',
    transition: 'width 0.15s ease-out, opacity 0.2s linear 0.3s',
  });

  /**
   * Creates a wrapper around `requestAnimationFrame` to enable a simpler task-based API for using
   * it. The wrapper object defines an `addTask` function that can be invoked to schedule a task to
   * run on the next animation frame. Description of `addTask` follows:
   *
   * Parameters
   * - label {string} an identifier for the task. If more than one tasks with the same label are
   *   scheduled in a single animation frame, only the most recently scheduled one will be executed.
   * - task {function} Callback function to execute on the next animation frame. The task will only
   *   run once, or not at all (if it is superceded by another task with the same label).
   */
  function createAnimationDispatcher() {
    let tasks = {};
    const loop = () => {
      for (const [, task] of Object.entries(tasks)) {
        task();
      }
      tasks = {};
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return {
      addTask: (label, task) => {
        tasks[label] = task;
      },
    };
  }

  /**
   * Hooks into all image elements created using `new Image()` to execute a supplied handler when
   * the image begins loading.
   * @param {(src: string) => any} handler Handler to call when an image begins loading. The URL of
   * the image is passed as the argument.
   */
  function hookImageLoad(handler) {
    const imageCons = window.Image;
    window.Image = function (...args) {
      const image = new imageCons(...args);
      // Workaround for Chrome bug not dispatching 'loadstart' for image elements:
      // https://bugs.chromium.org/p/chromium/issues/detail?id=458851
      setTimeout(() => handler(image.src), 0);
      // Correct implementation here
      // image.addEventListener('loadstart', event => {
      //   const imgSrc = event.target.src;
      //   handler(imgSrc);
      // });
      return image;
    };
  }

  /**
   * Tracks image loading progress and updates the progressbar.
   * @param {string} src URL of image.
   */
  async function asyncFetchImageProgress(src) {
    const mutex = ++switchMutex;
    const response = await fetch(src);
    updateLoadingProgress(0);
    const size = response.headers.get('Content-Length');
    if (response.body.getReader && size) {
      const reader = response.body.getReader();
      let progress = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done || mutex !== switchMutex) {
          break;
        }
        progress += value.length;
        updateLoadingProgress(progress / size);
      }
    }
  }

  /**
   * Updates the loading progress bar in the DOM.
   * @param {number} fraction Fraction of image loaded.
   */
  function updateLoadingProgress(fraction) {
    animator.addTask('loading', () => {
      divLoadingProgress.style.width = `${Math.round(fraction * 100)}%`;
      divLoadingProgress.style.opacity = 0 < fraction && fraction < 1 ? '1' : '0';
    })
  }

  /**
   * Handler to be called when any image begins loading. Activates the progress bar if the image
   * is the page being loaded.
   * @param {string} src URL of image.
   */
  function handleImageLoad(src) {
    if (!src) return;
    const currentPage = document.getElementsByClassName('active')[0].innerText;
    if (src.match(`${encodeURIComponent(currentPage)}\\.[A-Za-z]+`)) {
      asyncFetchImageProgress(src);
    }
  }

  hookImageLoad(handleImageLoad);
  divLoading.appendChild(divLoadingProgress);
})();
