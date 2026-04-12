;;; kaisho.el --- Emacs mode-line integration for kaisho -*- lexical-binding: t -*-

;; Author: kaisho
;; Package-Requires: ((emacs "27.1") (websocket "1.12"))
;; Keywords: tools, time-tracking

;;; Commentary:
;;
;; Connects to a running kaisho backend via WebSocket and REST, then
;; displays the active clock in the Emacs mode line.
;;
;; Quick start:
;;
;;   (require 'kaisho)
;;   (setq kaisho-url "http://localhost:8765")  ; or your port
;;   (kaisho-mode 1)
;;
;; `kaisho-mode' is a global minor mode.  It connects to the WebSocket
;; on enable and disconnects on disable.  When a clock is running you
;; will see something like  [* mycustomer 0:42]  in the mode line.
;; The elapsed time refreshes every minute.  When kaisho starts or
;; stops a clock the update arrives immediately via the WebSocket
;; notification.

;;; Code:

(require 'json)
(require 'url)
(require 'websocket)

(defgroup kaisho nil
  "Emacs integration for the kaisho time-tracking backend."
  :group 'tools
  :prefix "kaisho-")

(defcustom kaisho-url "http://localhost:8765"
  "Base URL of the kaisho backend, without trailing slash.
The WebSocket endpoint is derived by replacing the scheme with
ws/wss, e.g. http://localhost:8765 -> ws://localhost:8765."
  :type 'string
  :group 'kaisho)

(defcustom kaisho-mode-line-format " [* %d %h:%02m]"
  "Format string for the mode-line clock indicator.
%d is replaced with the clock description (falls back to
customer), %h with elapsed hours, %02m with zero-padded elapsed
minutes within the current hour."
  :type 'string
  :group 'kaisho)

(defcustom kaisho-reconnect-delay 5
  "Seconds to wait before reconnecting after a WebSocket close."
  :type 'integer
  :group 'kaisho)

;;; Internal state

(defvar kaisho--ws nil
  "Active `websocket' object, or nil when disconnected.")

(defvar kaisho--active-clock nil
  "Plist of the running clock as returned by /api/clocks/active,
or nil when no clock is running.")

(defvar kaisho--mode-line-string ""
  "Current mode-line segment string, updated by
`kaisho--update-mode-line'.")

(defvar kaisho--tick-timer nil
  "Repeating timer that refreshes the elapsed-time display every
60 seconds while a clock is running.")

;;; URL helpers

(defun kaisho--ws-url ()
  "Return the WebSocket URL derived from `kaisho-url'."
  (replace-regexp-in-string "^https" "wss"
    (replace-regexp-in-string "^http" "ws" kaisho-url)))

(defun kaisho--api-url (path)
  "Return the full REST URL for PATH."
  (concat kaisho-url path))

;;; Clock display

(defun kaisho--elapsed-minutes (start-iso)
  "Return total elapsed minutes since START-ISO (ISO-8601 string)."
  (let* ((start (date-to-time start-iso))
         (elapsed (float-time (time-subtract (current-time) start))))
    (floor (/ elapsed 60))))

(defun kaisho--format-mode-line (clock)
  "Return the mode-line string for CLOCK plist."
  (let* ((desc (or (plist-get clock :description)
                   (plist-get clock :customer)
                   "?"))
         (start (plist-get clock :start))
         (total-mins (kaisho--elapsed-minutes start))
         (h (/ total-mins 60))
         (m (% total-mins 60)))
    (format-spec kaisho-mode-line-format
                 `((?d . ,desc) (?h . ,h) (?m . ,m)))))

(defun kaisho--update-mode-line ()
  "Recompute `kaisho--mode-line-string' from `kaisho--active-clock'."
  (setq kaisho--mode-line-string
        (if kaisho--active-clock
            (kaisho--format-mode-line kaisho--active-clock)
          ""))
  (force-mode-line-update t))

;;; Clock state management

(defun kaisho--set-clock (data)
  "Record DATA as the active clock and start the tick timer."
  (setq kaisho--active-clock data)
  (kaisho--update-mode-line)
  (unless kaisho--tick-timer
    (setq kaisho--tick-timer
          (run-with-timer 60 60 #'kaisho--update-mode-line))))

(defun kaisho--clear-clock ()
  "Clear the active clock and stop the tick timer."
  (setq kaisho--active-clock nil)
  (when kaisho--tick-timer
    (cancel-timer kaisho--tick-timer)
    (setq kaisho--tick-timer nil))
  (kaisho--update-mode-line))

;;; REST fetch

(defun kaisho--fetch-active ()
  "Fetch /api/clocks/active and update clock state."
  (url-retrieve
   (kaisho--api-url "/api/clocks/active")
   (lambda (status)
     (if (plist-get status :error)
         (kaisho--clear-clock)
       (goto-char (point-min))
       (when (re-search-forward "^$" nil t)
         (let* ((json-object-type 'plist)
                (json-false nil)
                (data (ignore-errors (json-read))))
           (if (or (null data) (null (plist-get data :active)))
               (kaisho--clear-clock)
             (kaisho--set-clock data))))))
   nil
   :silent))

;;; WebSocket callbacks

(defun kaisho--on-message (_ws frame)
  "Handle an incoming WebSocket FRAME."
  (let* ((json-object-type 'plist)
         (json-false nil)
         (payload (ignore-errors
                    (json-read-from-string
                     (websocket-frame-text frame))))
         (resource (and payload (plist-get payload :resource))))
    (when (equal resource "clocks")
      (kaisho--fetch-active))))

(defun kaisho--on-close (_ws)
  "Handle WebSocket disconnect; schedule a reconnect."
  (setq kaisho--ws nil)
  (when kaisho-mode
    (run-with-timer kaisho-reconnect-delay nil #'kaisho--connect)))

(defun kaisho--on-error (_ws _type err)
  "Handle WebSocket error ERR."
  (message "kaisho: WebSocket error: %s" err))

;;; Connection management

(defun kaisho--connect ()
  "Open (or reopen) the WebSocket connection to kaisho."
  (when (and kaisho--ws (websocket-openp kaisho--ws))
    (websocket-close kaisho--ws))
  (condition-case err
      (progn
        (setq kaisho--ws
              (websocket-open
               (concat (kaisho--ws-url) "/ws")
               :on-message #'kaisho--on-message
               :on-close   #'kaisho--on-close
               :on-error   #'kaisho--on-error))
        (kaisho--fetch-active))
    (error
     (message "kaisho: could not connect to %s (%s); retrying in %ds"
              kaisho-url err kaisho-reconnect-delay)
     (run-with-timer kaisho-reconnect-delay nil #'kaisho--connect))))

(defun kaisho--disconnect ()
  "Close the WebSocket connection and clear clock state."
  (when kaisho--tick-timer
    (cancel-timer kaisho--tick-timer)
    (setq kaisho--tick-timer nil))
  (when (and kaisho--ws (websocket-openp kaisho--ws))
    (websocket-close kaisho--ws))
  (setq kaisho--ws nil)
  (kaisho--clear-clock))

;;; Minor mode

(defvar kaisho--mode-line-spec '(:eval kaisho--mode-line-string)
  "Mode-line spec added to `global-mode-string' by `kaisho-mode'.")

;;;###autoload
(define-minor-mode kaisho-mode
  "Global minor mode that shows the kaisho active clock in the mode line.

When enabled, connects to the kaisho backend at `kaisho-url' via
WebSocket and keeps the mode line updated in real time."
  :global t
  :group 'kaisho
  :lighter nil
  (if kaisho-mode
      (progn
        (add-to-list 'global-mode-string kaisho--mode-line-spec t)
        (kaisho--connect))
    (kaisho--disconnect)
    (setq global-mode-string
          (delete kaisho--mode-line-spec global-mode-string))))

;;; Interactive helpers

;;;###autoload
(defun kaisho-reconnect ()
  "Manually reconnect to the kaisho backend."
  (interactive)
  (kaisho--disconnect)
  (kaisho--connect))

(provide 'kaisho)
;;; kaisho.el ends here
