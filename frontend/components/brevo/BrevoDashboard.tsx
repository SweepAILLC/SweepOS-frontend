import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import EmailComposer from './EmailComposer';
import BrevoAnalytics from './BrevoAnalytics';

interface BrevoContact {
  id: number;
  email?: string | null;  // Email might be missing or null
  attributes?: Record<string, any>;
  emailBlacklisted?: boolean;
  listIds?: number[];
  createdAt?: string;
}

interface BrevoList {
  id: number;
  name: string;
  folderId?: number;
  uniqueSubscribers?: number;
  doubleOptin?: boolean;
  createdAt?: string;
}

type Tab = 'contacts' | 'lists' | 'analytics';

export default function BrevoDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('contacts');
  const [contacts, setContacts] = useState<BrevoContact[]>([]);
  const [lists, setLists] = useState<BrevoList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [listContacts, setListContacts] = useState<BrevoContact[]>([]);
  
  // Pagination
  const [contactsOffset, setContactsOffset] = useState(0);
  const [listsOffset, setListsOffset] = useState(0);
  const [listContactsOffset, setListContactsOffset] = useState(0);
  const [contactsCount, setContactsCount] = useState(0);
  const [listsCount, setListsCount] = useState(0);
  const [listContactsCount, setListContactsCount] = useState(0);
  const limit = 50;

  // Form states
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showMoveContacts, setShowMoveContacts] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [createClientFormData, setCreateClientFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    lifecycle_state: 'cold_lead' as 'cold_lead' | 'warm_lead' | 'active' | 'offboarding' | 'dead',
    notes: ''
  });
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailComposerMode, setEmailComposerMode] = useState<'contacts' | 'list' | 'selected' | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [listContactSearchQuery, setListContactSearchQuery] = useState('');

  useEffect(() => {
    if (activeTab === 'contacts') {
      loadContacts();
    } else if (activeTab === 'lists') {
      loadLists();
    }
    // Analytics tab loads its own data
  }, [activeTab, contactsOffset, listsOffset]);

  useEffect(() => {
    if (selectedListId) {
      loadListContacts();
      // Clear list contact search when switching lists
      setListContactSearchQuery('');
    }
  }, [selectedListId, listContactsOffset]);

  // Debug: Log form data changes (only when modal opens/closes, not on every keystroke)
  useEffect(() => {
    if (showCreateClient) {
      console.log('[BrevoDashboard] Modal opened with form data:', createClientFormData);
    }
  }, [showCreateClient]); // Only depend on showCreateClient, not formData

  const loadContacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getBrevoContacts(limit, contactsOffset);
      setContacts(data.contacts || []);
      setContactsCount(data.count || 0);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getBrevoLists(limit, listsOffset);
      setLists(data.lists || []);
      setListsCount(data.count || 0);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  };

  const loadListContacts = async () => {
    if (!selectedListId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getBrevoListContacts(selectedListId, limit, listContactsOffset);
      setListContacts(data.contacts || []);
      setListContactsCount(data.count || 0);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load list contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const listIdsStr = formData.get('listIds') as string;
    
    const attributes: Record<string, any> = {};
    if (firstName) attributes.FIRSTNAME = firstName;
    if (lastName) attributes.LASTNAME = lastName;

    const listIds = listIdsStr ? listIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined;

    setLoading(true);
    setError(null);
    try {
      await apiClient.createBrevoContact({ email, attributes, listIds });
      setShowCreateContact(false);
      await loadContacts();
      alert('Contact created successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteBrevoContact(contactId);
      await loadContacts();
      if (selectedListId) await loadListContacts();
      alert('Contact deleted successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete contact');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClientFromContact = async (contactId: number) => {
    console.log('[BrevoDashboard] handleCreateClientFromContact called for contact:', contactId);
    
    try {
      setLoading(true);
      
      // First, try to find contact in the current list
      const contactsToSearch = contactSearchQuery ? filteredContacts : contacts;
      let contact = contactsToSearch.find(c => c.id === contactId);
      
      // If not found in contacts list, try list contacts
      if (!contact && selectedListId) {
        const listContactsToSearch = listContactSearchQuery ? filteredListContacts : listContacts;
        contact = listContactsToSearch.find(c => c.id === contactId);
      }
      
      // If still not found, fetch from API
      if (!contact) {
        console.log('[BrevoDashboard] Contact not in list, fetching from API:', contactId);
        contact = await apiClient.getBrevoContact(contactId);
      }
      
      console.log('[BrevoDashboard] Using contact data:', contact);
      console.log('[BrevoDashboard] Contact attributes:', contact.attributes);
      
      // Extract data from contact - handle various attribute formats
      const attributes = contact.attributes || {};
      
      // Email extraction - try multiple sources
      let email = '';
      if (contact.email) {
        email = contact.email;
      } else if (attributes.EMAIL) {
        email = attributes.EMAIL;
      } else if (attributes.email) {
        email = attributes.email;
      }
      
      // First name extraction
      let first_name = '';
      if (attributes.FIRSTNAME) {
        first_name = attributes.FIRSTNAME;
      } else if (attributes.FIRST_NAME) {
        first_name = attributes.FIRST_NAME;
      } else if (attributes.firstName) {
        first_name = attributes.firstName;
      }
      
      // Last name extraction
      let last_name = '';
      if (attributes.LASTNAME) {
        last_name = attributes.LASTNAME;
      } else if (attributes.LAST_NAME) {
        last_name = attributes.LAST_NAME;
      } else if (attributes.lastName) {
        last_name = attributes.lastName;
      }
      
      // Phone extraction
      let phone = '';
      if (attributes.SMS) {
        phone = attributes.SMS;
      } else if (attributes.PHONE) {
        phone = attributes.PHONE;
      } else if (attributes.phone) {
        phone = attributes.phone;
      } else if (attributes.MOBILE) {
        phone = attributes.MOBILE;
      }
      
      console.log('[BrevoDashboard] Extracted data:', { email, first_name, last_name, phone });
      
      // Pre-fill form with extracted data
      const formData = {
        first_name: first_name || '',
        last_name: last_name || '',
        email: email || '',
        phone: phone || '',
        lifecycle_state: 'cold_lead' as const,
        notes: `Created from Brevo contact ID: ${contact.id}`
      };
      
      console.log('[BrevoDashboard] Final form data to set:', formData);
      
      // Set form data first, then open modal
      setCreateClientFormData(formData);
      setShowCreateClient(true);
      console.log('[BrevoDashboard] Modal opened');
      
    } catch (err: any) {
      console.error('[BrevoDashboard] Error in handleCreateClientFromContact:', err);
      console.error('[BrevoDashboard] Error details:', err.response?.data || err.message);
      setError(err.response?.data?.detail || err.message || 'Failed to load contact data');
      alert(err.response?.data?.detail || err.message || 'Failed to load contact data');
    } finally {
      setLoading(false);
      console.log('[BrevoDashboard] Loading set to false');
    }
  };

  const handleCreateClientsFromContacts = async () => {
    console.log('[BrevoDashboard] handleCreateClientsFromContacts called');
    console.log('[BrevoDashboard] selectedContacts:', selectedContacts);
    
    if (selectedContacts.length === 0) {
      alert('Please select at least one contact to create a client card');
      return;
    }

    // If single contact selected, open modal with pre-filled data
    if (selectedContacts.length === 1) {
      try {
        setLoading(true);
        const contactId = selectedContacts[0];
        
        // First, try to find contact in the current list
        const contactsToSearch = contactSearchQuery ? filteredContacts : contacts;
        let contact = contactsToSearch.find(c => c.id === contactId);
        
        // If not found in contacts list, try list contacts
        if (!contact && selectedListId) {
          const listContactsToSearch = listContactSearchQuery ? filteredListContacts : listContacts;
          contact = listContactsToSearch.find(c => c.id === contactId);
        }
        
        // If still not found, fetch from API
        if (!contact) {
          console.log('[BrevoDashboard] Contact not in list, fetching from API:', contactId);
          contact = await apiClient.getBrevoContact(contactId);
        }
        
        console.log('[BrevoDashboard] Using contact data:', contact);
        console.log('[BrevoDashboard] Contact attributes:', contact.attributes);
        
        // Extract data from contact - handle various attribute formats
        const attributes = contact.attributes || {};
        
        // Email extraction - try multiple sources
        let email = '';
        if (contact.email) {
          email = contact.email;
        } else if (attributes.EMAIL) {
          email = attributes.EMAIL;
        } else if (attributes.email) {
          email = attributes.email;
        }
        
        // First name extraction
        let first_name = '';
        if (attributes.FIRSTNAME) {
          first_name = attributes.FIRSTNAME;
        } else if (attributes.FIRST_NAME) {
          first_name = attributes.FIRST_NAME;
        } else if (attributes.firstName) {
          first_name = attributes.firstName;
        }
        
        // Last name extraction
        let last_name = '';
        if (attributes.LASTNAME) {
          last_name = attributes.LASTNAME;
        } else if (attributes.LAST_NAME) {
          last_name = attributes.LAST_NAME;
        } else if (attributes.lastName) {
          last_name = attributes.lastName;
        }
        
        // Phone extraction
        let phone = '';
        if (attributes.SMS) {
          phone = attributes.SMS;
        } else if (attributes.PHONE) {
          phone = attributes.PHONE;
        } else if (attributes.phone) {
          phone = attributes.phone;
        } else if (attributes.MOBILE) {
          phone = attributes.MOBILE;
        }
        
        console.log('[BrevoDashboard] Extracted data:', { email, first_name, last_name, phone });
        
        // Pre-fill form with extracted data
        const formData = {
          first_name: first_name || '',
          last_name: last_name || '',
          email: email || '',
          phone: phone || '',
          lifecycle_state: 'cold_lead' as const,
          notes: `Created from Brevo contact ID: ${contact.id}`
        };
        
        console.log('[BrevoDashboard] Final form data to set:', formData);
        
        // Set form data first, then open modal
        console.log('[BrevoDashboard] About to set form data:', formData);
        setCreateClientFormData(formData);
        setShowCreateClient(true);
        console.log('[BrevoDashboard] Modal opened');
      } catch (err: any) {
        console.error('[BrevoDashboard] Error loading contact:', err);
        setError(err.response?.data?.detail || 'Failed to load contact data');
        alert(err.response?.data?.detail || 'Failed to load contact data');
      } finally {
        setLoading(false);
      }
    } else {
      // Multiple contacts - use batch creation
      if (!confirm(`Create client cards for ${selectedContacts.length} selected contact(s)?`)) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.createClientsFromBrevoContacts(selectedContacts);
        setSelectedContacts([]);
        
        const createdCount = result.created_count || 0;
        const mergedCount = result.merged_count || 0;
        const skippedCount = result.skipped_count || 0;
        const failedCount = result.failed_count || 0;
        
        if (createdCount > 0 || mergedCount > 0) {
          const messageParts = [];
          if (createdCount > 0) {
            messageParts.push(`Created ${createdCount} new client(s)`);
          }
          if (mergedCount > 0) {
            messageParts.push(`Merged ${mergedCount} existing client(s)`);
          }
          if (skippedCount > 0 || failedCount > 0) {
            const issues = [];
            if (skippedCount > 0) issues.push(`${skippedCount} skipped`);
            if (failedCount > 0) issues.push(`${failedCount} failed`);
            messageParts.push(issues.join(', '));
          }
          
          const message = messageParts.length > 0
            ? messageParts.join('. ') + '.'
            : result.message || 'Successfully processed contacts!';
          alert(message);
        } else {
          alert(`No clients created or merged. ${skippedCount} skipped, ${failedCount} failed.`);
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to create clients');
        alert(err.response?.data?.detail || 'Failed to create clients');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCreateClient = async () => {
    if (!createClientFormData.email) {
      alert('Email is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.createClient(createClientFormData);
      alert('Client created successfully!');
      setShowCreateClient(false);
      setCreateClientFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        lifecycle_state: 'cold_lead',
        notes: ''
      });
      setSelectedContacts([]);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create client';
      setError(errorMessage);
      
      // Check if it's a duplicate error (409 Conflict)
      if (err.response?.status === 409 || errorMessage.includes('already exists')) {
        alert(`Cannot create client: A client with this email already exists.`);
      } else {
        alert(`Error creating client: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteContacts = async () => {
    if (selectedContacts.length === 0) {
      alert('Please select at least one contact to delete');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete ${selectedContacts.length} contact(s)? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    const contactsToDelete = [...selectedContacts]; // Store before clearing
    setSelectedContacts([]);
    
    try {
      const result = await apiClient.bulkDeleteBrevoContacts(contactsToDelete);
      
      // Always refresh regardless of result
      await loadContacts();
      if (selectedListId) await loadListContacts();
      await loadLists(); // Refresh lists to update subscriber counts
      
      // Check if the result indicates success
      if (result && result.success !== false) {
        if (result.failed_count && result.failed_count > 0) {
          // Partial success
          alert(`Deleted ${result.deleted_count || 0} of ${result.total_count || contactsToDelete.length} contact(s). ${result.failed_count} failed.`);
        } else {
          // Full success
          alert(`Successfully deleted ${result.deleted_count || contactsToDelete.length} contact(s)!`);
        }
      } else {
        // Response indicates failure but we still refresh
        alert(`Deleted ${result?.deleted_count || contactsToDelete.length} contact(s). Please refresh to see updated list.`);
      }
    } catch (err: any) {
      // Even on error, refresh to see actual state
      await loadContacts();
      if (selectedListId) await loadListContacts();
      await loadLists();
      
      // Only show error if we got a specific error message
      const errorMsg = err.response?.data?.detail || err.message;
      if (errorMsg && !errorMsg.includes('Successfully')) {
        setError(errorMsg);
        // Don't show alert for errors - the refresh will show the actual state
      } else {
        // If no specific error or if contacts were actually deleted, just show success
        alert(`Contacts deleted. Refreshing list...`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    setLoading(true);
    setError(null);
    try {
      await apiClient.createBrevoList({ name });
      setShowCreateList(false);
      await loadLists();
      alert('List created successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create list');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = async (listId: number) => {
    if (!confirm('Are you sure you want to delete this list? All contacts will be removed from it.')) return;
    
    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteBrevoList(listId);
      await loadLists();
      if (selectedListId === listId) {
        setSelectedListId(null);
        setListContacts([]);
      }
      alert('List deleted successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete list');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveContacts = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedContacts.length === 0) {
      alert('Please select at least one contact to move');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const destinationListId = parseInt(formData.get('destinationListId') as string);

    if (!selectedListId) {
      alert('Please select a source list first');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.moveBrevoContacts({
        contactIds: selectedContacts,
        sourceListId: selectedListId,
        destinationListId
      });
      setShowMoveContacts(false);
      setSelectedContacts([]);
      await loadListContacts();
      await loadLists();
      alert(`Successfully moved ${selectedContacts.length} contact(s)!`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to move contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddContactsToList = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedContacts.length === 0) {
      alert('Please select at least one contact to add');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const listId = parseInt(formData.get('listId') as string);

    setLoading(true);
    setError(null);
    try {
      await apiClient.addBrevoContactsToList({
        contactIds: selectedContacts,
        listId
      });
      setShowAddToList(false);
      setSelectedContacts([]);
      await loadContacts();
      await loadLists();
      if (selectedListId === listId) {
        await loadListContacts();
      }
      alert(`Successfully added ${selectedContacts.length} contact(s) to list!`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add contacts to list');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveContactsFromList = async () => {
    if (selectedContacts.length === 0) {
      alert('Please select at least one contact to remove');
      return;
    }

    if (!selectedListId) {
      alert('Please select a list first');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${selectedContacts.length} contact(s) from this list?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.removeBrevoContactsFromList({
        contactIds: selectedContacts,
        listId: selectedListId
      });
      setSelectedContacts([]);
      await loadListContacts();
      await loadLists();
      alert(`Successfully removed ${selectedContacts.length} contact(s) from list!`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove contacts from list');
    } finally {
      setLoading(false);
    }
  };

  const toggleContactSelection = (contactId: number) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const clearSelectedContacts = () => {
    setSelectedContacts([]);
  };

  // Filter contacts based on search query
  const filteredContacts = contacts.filter(contact => {
    if (!contactSearchQuery.trim()) return true;
    
    const query = contactSearchQuery.toLowerCase().trim();
    const email = (contact.email || contact.attributes?.EMAIL || contact.attributes?.email || '').toLowerCase();
    const firstName = (contact.attributes?.FIRSTNAME || contact.attributes?.firstName || '').toLowerCase();
    const lastName = (contact.attributes?.LASTNAME || contact.attributes?.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    
    return email.includes(query) || 
           firstName.includes(query) || 
           lastName.includes(query) ||
           fullName.includes(query);
  });

  // Filter list contacts based on search query
  const filteredListContacts = listContacts.filter(contact => {
    if (!listContactSearchQuery.trim()) return true;
    
    const query = listContactSearchQuery.toLowerCase().trim();
    const email = (contact.email || contact.attributes?.EMAIL || contact.attributes?.email || '').toLowerCase();
    const firstName = (contact.attributes?.FIRSTNAME || contact.attributes?.firstName || '').toLowerCase();
    const lastName = (contact.attributes?.LASTNAME || contact.attributes?.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    
    return email.includes(query) || 
           firstName.includes(query) || 
           lastName.includes(query) ||
           fullName.includes(query);
  });

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'contacts'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Contacts
          </button>
          <button
            onClick={() => setActiveTab('lists')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'lists'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Lists
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'analytics'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
          <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Contacts ({contactSearchQuery ? filteredContacts.length : contactsCount})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setContactsOffset(0);
                  loadContacts();
                }}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                title="Refresh contacts list"
              >
                🔄 Refresh
              </button>
              {selectedContacts.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      setEmailComposerMode('selected');
                      setShowEmailComposer(true);
                    }}
                    className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
                  >
                    Email Selected ({selectedContacts.length})
                  </button>
                  <button
                    onClick={() => setShowAddToList(true)}
                    className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20"
                  >
                    Add to List ({selectedContacts.length})
                  </button>
                  <button
                    onClick={handleBulkDeleteContacts}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-red-500 dark:bg-red-600 text-white hover:bg-red-600 dark:hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Delete Selected ({selectedContacts.length})
                  </button>
                </>
              )}
              <button
                onClick={() => setShowCreateContact(true)}
                className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
              >
                + Create Contact
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={contactSearchQuery}
              onChange={(e) => setContactSearchQuery(e.target.value)}
              placeholder="Search contacts by email, first name, or last name..."
              className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {contactSearchQuery && (
              <button
                onClick={() => setContactSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {loading && contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading contacts...</div>
          ) : (contactSearchQuery ? filteredContacts : contacts).length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {contactSearchQuery ? `No contacts found matching "${contactSearchQuery}"` : 'No contacts found'}
            </div>
          ) : (
            <>
              <div className="glass-card overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={(contactSearchQuery ? filteredContacts : contacts).length > 0 && selectedContacts.length === (contactSearchQuery ? filteredContacts : contacts).length}
                          onChange={(e) => {
                            const contactsToUse = contactSearchQuery ? filteredContacts : contacts;
                            if (e.target.checked) {
                              setSelectedContacts(contactsToUse.map(c => c.id));
                            } else {
                              setSelectedContacts([]);
                            }
                          }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Attributes
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Lists
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {(contactSearchQuery ? filteredContacts : contacts).map((contact) => (
                      <tr 
                        key={contact.id} 
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                        onClick={() => toggleContactSelection(contact.id)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(contact.id)}
                            onChange={() => toggleContactSelection(contact.id)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs">
                          <div className="break-words">
                            {contact.email || contact.attributes?.EMAIL || contact.attributes?.email || `Contact #${contact.id}`}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                          {contact.attributes ? (
                            <div className="space-y-1 break-words">
                              {contact.attributes.FIRSTNAME && (
                                <div>First: {contact.attributes.FIRSTNAME}</div>
                              )}
                              {contact.attributes.LASTNAME && (
                                <div>Last: {contact.attributes.LASTNAME}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {contact.listIds && contact.listIds.length > 0 ? (
                            <span>{contact.listIds.length} list(s)</span>
                          ) : (
                            <span className="text-gray-400">No lists</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedContacts([contact.id]);
                                setEmailComposerMode('contacts');
                                setShowEmailComposer(true);
                              }}
                              className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                              title="Send email to this contact"
                            >
                              Email
                            </button>
                            <button
                              onClick={() => handleCreateClientFromContact(contact.id)}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 font-medium"
                              title="Create client card from this contact"
                            >
                              Create Client
                            </button>
                            <button
                              onClick={() => handleDeleteContact(contact.id)}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination - Only show if not searching */}
              {!contactSearchQuery && (
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setContactsOffset(Math.max(0, contactsOffset - limit))}
                    disabled={contactsOffset === 0 || loading}
                    className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Showing {contactsOffset + 1} to {Math.min(contactsOffset + limit, contactsCount)} of {contactsCount}
                  </span>
                  <button
                    onClick={() => setContactsOffset(contactsOffset + limit)}
                    disabled={contactsOffset + limit >= contactsCount || loading}
                    className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
              {contactSearchQuery && (
                <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Showing {filteredContacts.length} of {contactsCount} contacts
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Lists Tab */}
      {activeTab === 'lists' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Lists ({listsCount})
            </h3>
            <button
              onClick={() => setShowCreateList(true)}
              className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
            >
              + Create List
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lists Column */}
            <div className="space-y-4">
              {loading && lists.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading lists...</div>
              ) : lists.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">No lists found</div>
              ) : (
                <div className="glass-card space-y-2">
                  {lists.map((list) => (
                    <div
                      key={list.id}
                      className={`p-4 rounded-lg cursor-pointer transition-colors ${
                        selectedListId === list.id
                          ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border-2 border-transparent'
                      }`}
                      onClick={() => {
                        setSelectedListId(list.id);
                        setListContactsOffset(0);
                        setSelectedContacts([]);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{list.name}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {list.uniqueSubscribers || 0} subscribers
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedListId(list.id);
                              setEmailComposerMode('list');
                              setShowEmailComposer(true);
                            }}
                            className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium"
                            title="Send email to entire list"
                          >
                            Email
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteList(list.id);
                            }}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination for Lists */}
              {listsCount > limit && (
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setListsOffset(Math.max(0, listsOffset - limit))}
                    disabled={listsOffset === 0 || loading}
                    className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {listsOffset + 1} - {Math.min(listsOffset + limit, listsCount)} of {listsCount}
                  </span>
                  <button
                    onClick={() => setListsOffset(listsOffset + limit)}
                    disabled={listsOffset + limit >= listsCount || loading}
                    className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* List Contacts Column */}
            <div className="space-y-4">
              {selectedListId ? (
                <>
                  <div className="flex justify-between items-center">
                    <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                      Contacts in List ({listContactSearchQuery ? filteredListContacts.length : listContactsCount})
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setListContactsOffset(0);
                          loadListContacts();
                        }}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                        title="Refresh list contacts"
                      >
                        🔄
                      </button>
                      {selectedContacts.length > 0 && (
                        <>
                          <button
                            onClick={() => {
                              setEmailComposerMode('selected');
                              setShowEmailComposer(true);
                            }}
                            className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
                          >
                            Email Selected ({selectedContacts.length})
                          </button>
                          <button
                            onClick={() => setShowMoveContacts(true)}
                            className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary"
                          >
                            Move Selected ({selectedContacts.length})
                          </button>
                          <button
                            onClick={handleRemoveContactsFromList}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium rounded-md bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Remove from List ({selectedContacts.length})
                          </button>
                          <button
                            onClick={handleBulkDeleteContacts}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium rounded-md bg-red-500 dark:bg-red-600 text-white hover:bg-red-600 dark:hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Delete Selected ({selectedContacts.length})
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Search Bar for List Contacts */}
                  <div className="relative">
                    <input
                      type="text"
                      value={listContactSearchQuery}
                      onChange={(e) => setListContactSearchQuery(e.target.value)}
                      placeholder="Search contacts in list..."
                      className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    {listContactSearchQuery && (
                      <button
                        onClick={() => setListContactSearchQuery('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {loading && listContacts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading contacts...</div>
                  ) : (listContactSearchQuery ? filteredListContacts : listContacts).length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      {listContactSearchQuery ? `No contacts found matching "${listContactSearchQuery}"` : 'No contacts in this list'}
                    </div>
                  ) : (
                    <>
                      <div className="glass-card space-y-2 max-h-96 overflow-y-auto">
                        {(listContactSearchQuery ? filteredListContacts : listContacts).map((contact) => (
                          <div
                            key={contact.id}
                            className={`p-3 rounded-lg flex items-center justify-between cursor-pointer ${
                              selectedContacts.includes(contact.id)
                                ? 'bg-primary-100 dark:bg-primary-900/30'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                            onClick={() => toggleContactSelection(contact.id)}
                          >
                            <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedContacts.includes(contact.id)}
                                onChange={() => toggleContactSelection(contact.id)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                                  {contact.email || contact.attributes?.EMAIL || contact.attributes?.email || `Contact #${contact.id}`}
                                </p>
                                {contact.attributes && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                                    {contact.attributes.FIRSTNAME} {contact.attributes.LASTNAME}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setSelectedContacts([contact.id]);
                                    setEmailComposerMode('list');
                                    setShowEmailComposer(true);
                                  }}
                                  className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 text-xs font-medium"
                                  title="Send email to this contact"
                                >
                                  Email
                                </button>
                                <button
                                  onClick={() => handleCreateClientFromContact(contact.id)}
                                  className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 text-xs font-medium"
                                  title="Create client card from this contact"
                                >
                                  Create Client
                                </button>
                                <button
                                  onClick={() => handleDeleteContact(contact.id)}
                                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pagination for List Contacts - Only show if not searching */}
                      {!listContactSearchQuery && listContactsCount > limit && (
                        <div className="flex justify-between items-center">
                          <button
                            onClick={() => setListContactsOffset(Math.max(0, listContactsOffset - limit))}
                            disabled={listContactsOffset === 0 || loading}
                            className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {listContactsOffset + 1} - {Math.min(listContactsOffset + limit, listContactsCount)} of {listContactsCount}
                          </span>
                          <button
                            onClick={() => setListContactsOffset(listContactsOffset + limit)}
                            disabled={listContactsOffset + limit >= listContactsCount || loading}
                            className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      )}
                      {listContactSearchQuery && (
                        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                          Showing {filteredListContacts.length} of {listContactsCount} contacts
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  Select a list to view its contacts
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <BrevoAnalytics />
      )}

      {/* Create Contact Modal */}
      {showCreateContact && (
        <div className="fixed inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-start justify-center z-[9999] p-4 overflow-y-auto" onClick={() => setShowCreateContact(false)} style={{ paddingTop: '2rem' }}>
          <div 
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create Contact</h3>
            <form onSubmit={handleCreateContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  name="firstName"
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  List IDs (comma-separated)
                </label>
                <input
                  type="text"
                  name="listIds"
                  placeholder="e.g., 1, 2, 3"
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateContact(false)}
                  className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create List Modal */}
      {showCreateList && (
        <div className="fixed inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-start justify-center z-[9999] p-4 overflow-y-auto" onClick={() => setShowCreateList(false)} style={{ paddingTop: '2rem' }}>
          <div 
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create List</h3>
            <form onSubmit={handleCreateList} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  List Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateList(false)}
                  className="px-4 py-2 text-sm font-medium rounded-md glass-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Contacts Modal */}
      {showMoveContacts && (
        <div className="fixed inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-start justify-center z-[9999] p-4 overflow-y-auto" onClick={() => setShowMoveContacts(false)} style={{ paddingTop: '2rem' }}>
          <div 
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Move {selectedContacts.length} Contact(s)
            </h3>
            <form onSubmit={handleMoveContacts} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Destination List *
                </label>
                <select
                  name="destinationListId"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                >
                  <option value="">Select a list...</option>
                  {lists
                    .filter(list => list.id !== selectedListId)
                    .map(list => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.uniqueSubscribers || 0} subscribers)
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMoveContacts(false)}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-primary-500 dark:bg-primary-600 text-white hover:bg-primary-600 dark:hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Move Contacts
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add to List Modal */}
      {showAddToList && (
        <div className="fixed inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-start justify-center z-[9999] p-4 overflow-y-auto" onClick={() => setShowAddToList(false)} style={{ paddingTop: '2rem' }}>
          <div 
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Add {selectedContacts.length} Contact(s) to List
            </h3>
            <form onSubmit={handleAddContactsToList} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Select List *
                </label>
                <select
                  name="listId"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                >
                  <option value="">Select a list...</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.uniqueSubscribers || 0} subscribers)
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Contacts will be added to this list. They can be in multiple lists.
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddToList(false)}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-primary-500 dark:bg-primary-600 text-white hover:bg-primary-600 dark:hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add to List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Composer Modal */}
      {showEmailComposer && (
        <EmailComposer
          contactIds={emailComposerMode === 'selected' || emailComposerMode === 'contacts' ? selectedContacts : undefined}
          listId={emailComposerMode === 'list' ? selectedListId || undefined : undefined}
          onClose={() => {
            setShowEmailComposer(false);
            setEmailComposerMode(null);
          }}
          onSuccess={() => {
            // Clear selections and refresh data
            clearSelectedContacts();
            if (activeTab === 'contacts') {
              loadContacts();
            } else {
              loadLists();
              if (selectedListId) {
                loadListContacts();
              }
            }
          }}
        />
      )}

      {/* Create Client Modal */}
      {showCreateClient && (
        <div className="fixed inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-start justify-center z-[9999] p-4 overflow-y-auto" onClick={() => setShowCreateClient(false)} style={{ paddingTop: '2rem' }}>
          <div 
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create Client from Contact</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="client-first-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  id="client-first-name"
                  name="first_name"
                  type="text"
                  autoComplete="given-name"
                  value={createClientFormData.first_name}
                  onChange={(e) => setCreateClientFormData({ ...createClientFormData, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="John"
                />
              </div>

              <div>
                <label htmlFor="client-last-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  id="client-last-name"
                  name="last_name"
                  type="text"
                  autoComplete="family-name"
                  value={createClientFormData.last_name}
                  onChange={(e) => setCreateClientFormData({ ...createClientFormData, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="Doe"
                />
              </div>

              <div>
                <label htmlFor="client-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  id="client-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={createClientFormData.email}
                  onChange={(e) => setCreateClientFormData({ ...createClientFormData, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label htmlFor="client-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  id="client-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={createClientFormData.phone}
                  onChange={(e) => setCreateClientFormData({ ...createClientFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label htmlFor="client-lifecycle-state" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Initial Status
                </label>
                <select
                  id="client-lifecycle-state"
                  name="lifecycle_state"
                  autoComplete="off"
                  value={createClientFormData.lifecycle_state}
                  onChange={(e) => setCreateClientFormData({ ...createClientFormData, lifecycle_state: e.target.value as typeof createClientFormData.lifecycle_state })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                >
                  <option value="cold_lead">Cold Lead</option>
                  <option value="warm_lead">Warm Lead</option>
                  <option value="active">Active</option>
                  <option value="offboarding">Offboarding</option>
                  <option value="dead">Dead</option>
                </select>
              </div>

              <div>
                <label htmlFor="client-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  id="client-notes"
                  name="notes"
                  autoComplete="off"
                  value={createClientFormData.notes}
                  onChange={(e) => setCreateClientFormData({ ...createClientFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  rows={3}
                  placeholder="Additional notes about this client..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateClient(false);
                  setCreateClientFormData({
                    first_name: '',
                    last_name: '',
                    email: '',
                    phone: '',
                    lifecycle_state: 'cold_lead',
                    notes: ''
                  });
                }}
                className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateClient}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary-500 dark:bg-primary-600 text-white hover:bg-primary-600 dark:hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

