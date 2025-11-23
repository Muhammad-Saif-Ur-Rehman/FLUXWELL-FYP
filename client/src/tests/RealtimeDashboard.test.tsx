// client/src/tests/RealtimeDashboard.test.tsx
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RealtimeDashboard from '../components/Realtime/RealtimeDashboard';

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

describe('RealtimeDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    (window.localStorage.getItem as jest.Mock).mockClear();
  });

  const mockUser = {
    auth_provider: 'google',
    full_name: 'Test User',
    profile_picture_url: 'https://example.com/avatar.jpg'
  };

  const mockMetricsData = {
    heart_rate: 75,
    steps: 5000,
    calories: 2000,
    distance: 3.5,
    blood_pressure: '120/80',
    blood_glucose: 95,
    oxygen_saturation: 98,
    body_temperature: 36.8,
    sleep: 'deep'
  };

  it('renders health service connection card for form users', () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify({
        ...mockUser,
        auth_provider: 'form'
      });
      return null;
    });

    // Mock API to return 400 error for form users without health service
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    render(<RealtimeDashboard />);

    expect(screen.getByText('Connect a Health Service')).toBeInTheDocument();
    expect(screen.getByText('Choose how you want to track your health data')).toBeInTheDocument();
    expect(screen.getByText('Connect Google Fit')).toBeInTheDocument();
    expect(screen.getByText('Connect Fitbit')).toBeInTheDocument();
  });

  it('renders metrics dashboard for Google/Fitbit users', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetricsData,
    });

    render(<RealtimeDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Your Health Metrics')).toBeInTheDocument();
    });

    // Check that metric cards are rendered
    expect(screen.getByText('Heart Rate')).toBeInTheDocument();
    expect(screen.getByText('Steps Today')).toBeInTheDocument();
    expect(screen.getByText('Sleep Duration')).toBeInTheDocument();
    expect(screen.getByText('Calories Burned')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument();
    expect(screen.getByText('Blood Glucose')).toBeInTheDocument();
    expect(screen.getByText('Oxygen Saturation')).toBeInTheDocument();
    expect(screen.getByText('Body Temperature')).toBeInTheDocument();
  });

  it('fetches metrics data on component mount', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetricsData,
    });

    render(<RealtimeDashboard />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/realtime/metrics', {
        headers: { 'Authorization': 'Bearer test_token' }
      });
    });
  });

  it('handles API errors gracefully', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Server Error'),
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<RealtimeDashboard />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('❌ Failed to fetch metrics:', 500, 'Server Error');
    });

    consoleSpy.mockRestore();
  });

  it('handles network errors gracefully', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<RealtimeDashboard />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching metrics:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('updates metrics every 5 seconds', async () => {
    jest.useFakeTimers();
    
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetricsData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockMetricsData, heart_rate: 80 }),
      });

    render(<RealtimeDashboard />);

    // Wait for initial fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Fast-forward time by 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Wait for second fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    jest.useRealTimers();
  });

  it('displays correct emojis for each metric', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetricsData,
    });

    render(<RealtimeDashboard />);

    await waitFor(() => {
      // Check that emojis are rendered (they should be in the DOM as text content)
      expect(screen.getByText('❤️')).toBeInTheDocument(); // Heart Rate
      expect(screen.getByText('🚶')).toBeInTheDocument(); // Steps
      expect(screen.getByText('😴')).toBeInTheDocument(); // Sleep
      expect(screen.getByText('🔥')).toBeInTheDocument(); // Calories
      expect(screen.getByText('🏃')).toBeInTheDocument(); // Distance
      expect(screen.getByText('🩸')).toBeInTheDocument(); // Blood Pressure
      expect(screen.getByText('🍯')).toBeInTheDocument(); // Blood Glucose
      expect(screen.getByText('🫁')).toBeInTheDocument(); // Oxygen Saturation
      expect(screen.getByText('🌡️')).toBeInTheDocument(); // Body Temperature
    });
  });

  it('displays last update timestamp', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetricsData,
    });

    render(<RealtimeDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  it('handles missing access token', async () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockUser));
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return null;
      return JSON.stringify(mockUser);
    });

    render(<RealtimeDashboard />);

    // Should not make API call without token
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('transforms API data correctly', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetricsData,
    });

    render(<RealtimeDashboard />);

    await waitFor(() => {
      // Check that values are displayed correctly
      expect(screen.getByText('75')).toBeInTheDocument(); // Heart rate
      expect(screen.getByText('5,000')).toBeInTheDocument(); // Steps (formatted)
      expect(screen.getByText('2,000')).toBeInTheDocument(); // Calories (formatted)
      expect(screen.getByText('3.5')).toBeInTheDocument(); // Distance
      expect(screen.getByText('120/80')).toBeInTheDocument(); // Blood pressure
      expect(screen.getByText('95')).toBeInTheDocument(); // Blood glucose
      expect(screen.getByText('98')).toBeInTheDocument(); // Oxygen saturation
      expect(screen.getByText('36.8')).toBeInTheDocument(); // Body temperature
    });
  });

  it('handles null/undefined API responses', async () => {
    (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === 'access_token') return 'test_token';
      if (key === 'user') return JSON.stringify(mockUser);
      return null;
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // Empty response
    });

    render(<RealtimeDashboard />);

    await waitFor(() => {
      // Should display default values (0) for missing data
      expect(screen.getAllByText('0')).toHaveLength(7); // 7 metrics with default value 0
    });
  });

});
