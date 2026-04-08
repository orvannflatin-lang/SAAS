#!/bin/bash
echo "Starting X virtual framebuffer (Xvfb) on :99..."
Xvfb :99 -screen 0 1280x720x24 -ac &
export DISPLAY=:99

echo "Starting Fluxbox window manager..."
fluxbox &

echo "Starting x11vnc server on port 5900..."
x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -forever -bg

echo "Starting Node.js worker..."
exec npm run dev
