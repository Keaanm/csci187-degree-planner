// Keaan Mirchandani
// Tests signing up, logging in and out, and what happens when the session ends.
// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createQueryClient } from '../src/queries';
import { ACCOUNT, PASSWORD, fakeBackend } from './fakeBackend';

beforeAll(() => {
  // cmdk (the course picker) and Radix need these, which jsdom doesn't have.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
});

function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  render(
    <QueryClientProvider client={createQueryClient({ retry: 0 })}>
      <App />
    </QueryClientProvider>,
  );
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
// Adds MATH 11 to Year 1 Fall from the requirements panel. It autosaves a second later.
async function editPlan() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add MATH 11 to the plan' }));
  fireEvent.click(screen.getByRole('button', { name: /^Year 1 Fall/ }));
}

const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('accounts', () => {
  it('sends a logged-out student to the login page', async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByText('My Plan')).toBeNull();
  });

  it('logs in and shows the plan with the email and a Log out button', async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/login');
    await screen.findByRole('heading', { name: 'Log in' });
    type('Email', ACCOUNT.email);
    type('Password', PASSWORD);
    submit('Log in');
    expect(await screen.findByRole('heading', { name: 'My Plan' })).toBeTruthy();
    expect(screen.getByText(ACCOUNT.email)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('goes back to the page the student asked for after logging in', async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/courses?q=data');
    await screen.findByRole('heading', { name: 'Log in' });
    type('Email', ACCOUNT.email);
    type('Password', PASSWORD);
    submit('Log in');
    await waitFor(() => expect(window.location.pathname).toBe('/courses'));
    expect(window.location.search).toBe('?q=data');
  });

  it("shows the server's message for a wrong password and stays on the login page", async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/login');
    await screen.findByRole('heading', { name: 'Log in' });
    type('Email', ACCOUNT.email);
    type('Password', 'wrong password');
    submit('Log in');
    expect(await screen.findByText('Wrong email or password')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeTruthy();
  });

  it('signs up with the email, password and the fall the student started', async () => {
    const backend = fakeBackend({ loggedIn: false });
    renderAppAt('/signup');
    await screen.findByRole('heading', { name: 'Create an account' });
    type('Email', 'ben@scu.edu');
    type('Password', 'a long password');
    type('First quarter at SCU', '2025');
    submit('Create account');
    expect(await screen.findByRole('heading', { name: 'My Plan' })).toBeTruthy();
    expect(screen.getByText('ben@scu.edu')).toBeTruthy();
    expect(backend.posts).toEqual([
      { url: '/api/signup', body: { email: 'ben@scu.edu', password: 'a long password', startYear: 2025 } },
    ]);
  });

  it('asks for the start quarter before sending a sign-up', async () => {
    const backend = fakeBackend({ loggedIn: false });
    renderAppAt('/signup');
    await screen.findByRole('heading', { name: 'Create an account' });
    type('Email', 'ben@scu.edu');
    type('Password', 'a long password');
    submit('Create account');
    expect(await screen.findByText('Choose the quarter you started at SCU')).toBeTruthy();
    expect(backend.posts).toEqual([]);
  });

  it("shows the server's message when the email already has an account", async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/signup');
    await screen.findByRole('heading', { name: 'Create an account' });
    type('Email', ACCOUNT.email);
    type('Password', 'a long password');
    type('First quarter at SCU', '2025');
    submit('Create account');
    expect(await screen.findByText('An account with that email already exists')).toBeTruthy();
  });

  it('links between the login and sign-up pages', async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/login');
    fireEvent.click(await screen.findByRole('link', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  });

  it('sends a logged-in student away from the login page', async () => {
    fakeBackend();
    renderAppAt('/login');
    expect(await screen.findByRole('heading', { name: 'My Plan' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('logs out straight away when everything is saved', async () => {
    const backend = fakeBackend();
    renderAppAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(backend.posts).toEqual([{ url: '/api/logout', body: undefined }]);
  });

  it('asks before logging out while changes are saving, then logs out once they save', async () => {
    const backend = fakeBackend();
    renderAppAt('/');
    await editPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Your changes are still saving' })).toBeTruthy();
    // The autosave finishes, and only then does it log out.
    expect(await screen.findByRole('heading', { name: 'Log in' }, { timeout: 3000 })).toBeTruthy();
    expect(backend).toHaveLength(1);
    expect(backend.posts).toEqual([{ url: '/api/logout', body: undefined }]);
  });

  it('can log out right away and lose the unsaved changes', async () => {
    const backend = fakeBackend();
    renderAppAt('/');
    await editPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Log out now' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(backend).toHaveLength(0);
  });

  it('stays logged in when the student chooses to', async () => {
    const backend = fakeBackend();
    renderAppAt('/');
    await editPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stay logged in' }));
    await screen.findByText(/^Saved /, {}, { timeout: 3000 });
    expect(screen.getByRole('heading', { name: 'My Plan' })).toBeTruthy();
    expect(backend.posts).toEqual([]);
  });

  it('warns that the changes will be lost when they failed to save', async () => {
    fakeBackend({ saveError: 'The server returned 500' });
    renderAppAt('/');
    await editPlan();
    await screen.findByText(/Couldn't save/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Log out without saving?' })).toBeTruthy();
  });

  it("doesn't send the next student to the last student's page after a logout", async () => {
    fakeBackend();
    renderAppAt('/courses');
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    await screen.findByRole('heading', { name: 'Log in' });
    type('Email', ACCOUNT.email);
    type('Password', PASSWORD);
    submit('Log in');
    await screen.findByRole('heading', { name: 'My Plan' });
    expect(window.location.pathname).toBe('/');
  });

  it('goes back to the page the student asked for after signing up instead', async () => {
    fakeBackend({ loggedIn: false });
    renderAppAt('/courses');
    fireEvent.click(await screen.findByRole('link', { name: 'Create an account' }));
    await screen.findByRole('heading', { name: 'Create an account' });
    type('Email', 'ben@scu.edu');
    type('Password', 'a long password');
    type('First quarter at SCU', '2025');
    submit('Create account');
    await waitFor(() => expect(window.location.pathname).toBe('/courses'));
  });

  it('explains why the student is back at the login page when the session ends', async () => {
    const backend = fakeBackend();
    renderAppAt('/');
    await screen.findByRole('heading', { name: 'My Plan' });
    backend.endSession();
    await editPlan();
    // The autosave gets a 401.
    expect(await screen.findByRole('heading', { name: 'Log in' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(/You were logged out because your session ended/)).toBeTruthy();
  });

  it('goes to the login page when the plan fails to load with a 401', async () => {
    const backend = fakeBackend();
    backend.endSession();
    // /api/me still says logged in (cached as the session ended between the two requests).
    backend.meStillLoggedIn = true;
    renderAppAt('/');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByText(/You were logged out because your session ended/)).toBeTruthy();
  });

  it("doesn't show the last student's plan to the next one", async () => {
    fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [{ code: 'CSCI 10', quarter: 0, status: 'planned' }] } });
    renderAppAt('/');
    expect(within(await screen.findByRole('region', { name: 'Year 1' })).getByText('CSCI 10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('link', { name: 'Create an account' });

    // A different student, on the same browser, with no saved plan of their own.
    fireEvent.click(screen.getByRole('link', { name: 'Create an account' }));
    await screen.findByRole('heading', { name: 'Create an account' });
    type('Email', 'ben@scu.edu');
    type('Password', 'a long password');
    type('First quarter at SCU', '2025');
    submit('Create account');
    expect(await screen.findByText(/Start by adding the courses you have already taken/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Year 1' })).queryByText('CSCI 10')).toBeNull();
    expect(screen.queryByText(/You were logged out/)).toBeNull();
  });
});
